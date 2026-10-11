using Adhd.Application.Recurrence;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore
{
    public async Task<RecurrenceEffect> UpdateAsync(Guid userId, Guid id, RecurrenceUpdate command, string key, CancellationToken ct)
    {
        command = command with { Rule = Rule(command.Rule), Task = Defaults(command.Task) }; Date(command.EffectiveFrom);
        if (command.RefreshExisting) { if (command.RefreshThrough is null) throw Invalid("refresh_window_required", "Mevcut örnek yenilemesi için açık bitiş tarihi seçin."); Window(command.EffectiveFrom, command.RefreshThrough.Value); }
        else if (command.RefreshThrough.HasValue) throw Invalid("refresh_window_invalid", "Yenileme kapalıyken pencere bitişi verilmez.");
        var payload = new { id, command }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var replay = await Replay(userId, "recurrence-update", key, payload, ct); if (replay is not null) return replay;
        var template = await Find(userId, id, ct); Check(template, command.Version); var now = clock.GetUtcNow();
        if (command.EffectiveFrom < PlanTime.Date(now, command.Rule.TimeZoneId)) throw Conflict("recurrence_past_protected", "Seri değişimi bugünden veya gelecekten başlamalı.");
        await Pool(userId, command.Task, ct); template.Version++; template.UpdatedAt = now; var definition = Definition(template, command.EffectiveFrom, command.Rule, command.Task, now); db.RecurrenceDefinitions.Add(definition);
        var refreshed = new List<Guid>(); var protectedIds = new List<Guid>(); RecurrenceOccurrence[] rows = [];
        if (command.RefreshExisting)
        {
            rows = await db.RecurrenceOccurrences.Where(x => x.UserId == userId && x.TemplateId == id && x.LocalDate >= command.EffectiveFrom && x.LocalDate <= command.RefreshThrough).ToArrayAsync(ct);
            var ids = rows.Where(x => x.TaskId.HasValue).Select(x => x.TaskId!.Value).ToArray(); var tasks = await db.Tasks.Where(x => x.UserId == userId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            var work = await db.WorkSessions.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value)).Select(x => x.TaskId!.Value).Distinct().ToArrayAsync(ct);
            var planned = await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned).Select(x => x.TaskId!.Value).Distinct().ToArrayAsync(ct);
            var parents = await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId.HasValue && ids.Contains(x.ParentTaskId.Value)).Select(x => x.ParentTaskId!.Value).Distinct().ToArrayAsync(ct);
            var dayPlanned = await db.DayItems.Where(x => x.UserId == userId && ids.Contains(x.TaskId)).Select(x=>x.TaskId).Distinct().ToArrayAsync(ct);
            var blocked = work.Concat(planned).Concat(dayPlanned).Concat(parents).ToHashSet();
            foreach (var row in rows.Where(x => x.TaskId.HasValue))
            {
                var task = tasks[row.TaskId!.Value];
                if (row.State != OccurrenceState.Materialized || row.LocalDate < PlanTime.Date(now, row.TimeZoneId) || task.State != TaskState.Pending || task.ArchivedAt.HasValue || task.Version != row.SyncedTaskVersion || blocked.Contains(task.Id)) { protectedIds.Add(task.Id); continue; }
                var before = TaskStore.View(task); var matches = RecurrenceRules.Matches(command.Rule, row.LocalDate); var candidate = matches ? Candidate(command.Rule, row.LocalDate) : null;
                if (candidate is null || candidate.Skipped)
                {
                    _ = await new TaskLifecycleStore(db, preferences, clock).ExecuteInTransaction(userId, task.Id, new(task.Version, TaskAction.Skip, null), ct);
                    row.State = OccurrenceState.Skipped; row.Reason = candidate?.Reason ?? "SeriesChanged";
                }
                else
                {
                    Apply(task, command.Task, candidate.DueAt); task.Version++; task.UpdatedAt = now; TaskHistory.Append(db, task, "RecurrenceRefreshed", before, new { templateId = id, occurrenceId = row.Id, definitionId = definition.Id });
                }
                row.AppliedDefinitionId = definition.Id; row.SyncedTaskVersion = task.Version; refreshed.Add(task.Id);
            }
        }
        if (refreshed.Count > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = await Result(userId, template, definition, rows, refreshed.ToArray(), protectedIds.ToArray(), state.PlanningVersion, "recurrence-update", key, payload, ct); await tx.CommitAsync(ct); return result;
    }
    public async Task<RecurrenceEffect> ChangeOccurrenceAsync(Guid userId, Guid id, DateOnly date, ChangeOccurrence command, bool cancel, string key, CancellationToken ct)
    {
        Date(date); var payload = new { id, date, command, cancel }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "recurrence-occurrence", key, payload, ct); if (replay is not null) return replay;
        var template = await Find(userId, id, ct); Check(template, command.Version); var definitions = await Definitions(userId, id, date, date, ct); var definition = Applicable(definitions, date) ?? throw Missing("occurrence_not_found");
        var rule = Read<RecurrenceRule>(definition.Rule); var row = await db.RecurrenceOccurrences.SingleOrDefaultAsync(x => x.UserId == userId && x.TemplateId == id && x.LocalDate == date, ct); var now = clock.GetUtcNow();
        if (date < PlanTime.Date(now, row?.TimeZoneId ?? rule.TimeZoneId)) throw Conflict("recurrence_past_protected", "Geçmiş occurrence marker'ı değiştirilmez; görev geçmişini ayrı düzenleyin.");
        if (row is null)
        {
            if (command.TaskVersion.HasValue || !RecurrenceRules.Matches(rule, date)) throw Invalid("occurrence_invalid", "Bu tarihte oluşum yok veya task sürümü gereksiz.");
            // Kullanıcı atladıysa veya iptal ettiyse belirsiz son tarihi çözmemize gerek yok.
            row = Occurrence(template, definition, new(date, rule.TimeZoneId, rule.DueTime, null, false, true, "User"), now); db.RecurrenceOccurrences.Add(row);
        }
        else if (row.TaskId is { } taskId)
        {
            var task = await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
            if (task.Version != command.TaskVersion) throw Conflict("version_conflict", "Occurrence görevi değişmiş; güncel sürümü alın.");
            if (task.State == TaskState.Completed || task.ArchivedAt.HasValue) throw Conflict("recurrence_history_protected", "Tamamlanmış/arşivlenmiş occurrence korunur.");
            var beforeVersion = task.Version;
            _ = await new TaskLifecycleStore(db, preferences, clock).ExecuteInTransaction(userId, taskId, new(task.Version, cancel ? TaskAction.Cancel : TaskAction.Skip, null), ct);
            if (task.Version != beforeVersion) { state.PlanningVersion++; state.UpdatedAt = now; }
        }
        row.State = cancel ? OccurrenceState.Canceled : OccurrenceState.Skipped; row.Reason = "User";
        var result = await Result(userId, template, await Head(userId, id, ct), [row], [], [], state.PlanningVersion, "recurrence-occurrence", key, payload, ct); await tx.CommitAsync(ct); return result;
    }
}
