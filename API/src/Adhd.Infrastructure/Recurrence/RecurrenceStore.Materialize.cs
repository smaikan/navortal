using Adhd.Application.Recurrence;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore
{
    public async Task<RecurrenceEffect> MaterializeAsync(Guid userId, Guid id, MaterializeRecurrence command, string key, CancellationToken ct)
    {
        Window(command.FromDate, command.ToDate); var payload = new { id, command }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "recurrence-materialize", key, payload, ct); if (replay is not null) return replay;
        var template = await Find(userId, id, ct); Check(template, command.Version); if (!template.Enabled) throw Conflict("recurrence_disabled", "Şablon pasif; yeni örnek üretilmez.");
        var definitions = await Definitions(userId, id, command.FromDate, command.ToDate, ct);
        var existing = await db.RecurrenceOccurrences.Where(x => x.UserId == userId && x.TemplateId == id && x.LocalDate >= command.FromDate && x.LocalDate <= command.ToDate).ToListAsync(ct);
        var dormant = existing.Where(x => OccurrenceReason.Revivable(x.State, x.Reason, x.TaskId)).ToDictionary(x => x.LocalDate);
        var held = existing.Select(x => x.LocalDate).Where(x => !dormant.ContainsKey(x)).ToHashSet(); var now = clock.GetUtcNow(); var made = 0; var returning = new List<Returning>();
        var order = await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0;
        for (var date = command.FromDate; date <= command.ToDate; date = date.AddDays(1))
        {
            if (held.Contains(date)) continue; var definition = Applicable(definitions, date); if (definition is null) continue;
            var rule = Read<RecurrenceRule>(definition.Rule); if (!RecurrenceRules.Matches(rule, date)) continue; var candidate = Candidate(rule, date); var fields = Read<RecurringTaskDefaults>(definition.TaskDefaults);
            if (dormant.TryGetValue(date, out var closed))
            {
                if (!candidate.Skipped && date >= PlanTime.Date(now, rule.TimeZoneId)) returning.Add(new(closed, definition, fields, candidate));
                continue;
            }
            var occurrence = Occurrence(template, definition, candidate, now); existing.Add(occurrence); db.RecurrenceOccurrences.Add(occurrence);
            if (candidate.Skipped) continue;
            await Pool(userId, fields, ct); order += 1024;
            var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now, SortOrder = order };
            Apply(task, fields, candidate.DueAt); occurrence.TaskId = task.Id; occurrence.SyncedTaskVersion = task.Version; db.Tasks.Add(task);
            TaskHistory.Append(db, task, "CreatedFromRecurrence", null, new { templateId = id, occurrenceId = occurrence.Id, definitionId = definition.Id, localDate = date, candidate.TimeZoneId, candidate.DueTime, candidate.Adjusted }); made++;
        }
        made += await Revive(userId, id, returning, now, ct);
        var planned = await AddAutomaticPlans(userId, existing.ToArray(), definitions, state.PlanningVersion, now, ct);
        if (made > 0 || planned > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = await Result(userId, template, await Head(userId, id, ct), existing.ToArray(), [], [], state.PlanningVersion, "recurrence-materialize", key, payload, ct); await tx.CommitAsync(ct); return result;
    }
    private sealed record Returning(RecurrenceOccurrence Row, RecurrenceDefinition Definition, RecurringTaskDefaults Fields, RecurrenceCandidate Candidate);
    // Seri kararıyla kapanmış oluşumu aynı görevle geri açar. Sonradan elle değişmiş görev kapalı kalır.
    private async Task<int> Revive(Guid userId, Guid templateId, List<Returning> rows, DateTimeOffset now, CancellationToken ct)
    {
        if (rows.Count == 0) return 0;
        var ids = rows.Select(x => x.Row.TaskId!.Value).ToArray(); var tasks = await db.Tasks.Where(x => x.UserId == userId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var ready = rows.Where(x => tasks[x.Row.TaskId!.Value] is { State: TaskState.Skipped, ArchivedAt: null, DeletedAt: null } task && task.Version == x.Row.SyncedTaskVersion).ToArray();
        await new TaskLifecycleStore(db, preferences, clock).ExecuteManyInTransaction(userId, ready.Select(x => x.Row.TaskId!.Value).ToArray(), TaskAction.Reopen, ct);
        foreach (var (row, definition, fields, candidate) in ready)
        {
            await Pool(userId, fields, ct); var task = tasks[row.TaskId!.Value]; var before = TaskStore.View(task);
            Apply(task, fields, candidate.DueAt); task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "RecurrenceRevived", before, new { templateId, occurrenceId = row.Id, definitionId = definition.Id });
            row.State = OccurrenceState.Materialized; row.Reason = null; row.AppliedDefinitionId = definition.Id; row.DueTime = candidate.DueTime; row.DueAt = candidate.DueAt; row.TimeAdjusted = candidate.Adjusted; row.SyncedTaskVersion = task.Version;
        }
        return ready.Length;
    }
    private async Task<RecurrenceDefinition[]> Definitions(Guid userId, Guid id, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var first = await db.RecurrenceDefinitions.Where(x => x.UserId == userId && x.TemplateId == id && x.EffectiveFrom <= from).OrderByDescending(x => x.Number).FirstOrDefaultAsync(ct);
        var number = first?.Number ?? 0;
        return await db.RecurrenceDefinitions.Where(x => x.UserId == userId && x.TemplateId == id && x.EffectiveFrom <= to && x.Number >= number).OrderByDescending(x => x.Number).ToArrayAsync(ct);
    }
    private static RecurrenceDefinition? Applicable(IEnumerable<RecurrenceDefinition> definitions, DateOnly date) => definitions.Where(x => x.EffectiveFrom <= date).OrderByDescending(x => x.Number).FirstOrDefault();
    private static RecurrenceCandidate Candidate(RecurrenceRule rule, DateOnly date)
    {
        try { return RecurrenceRules.Resolve(rule, date); } catch (RecurrenceTimeException e) { throw Invalid("recurrence_local_time_invalid", $"{e.LocalDate:yyyy-MM-dd}: {e.Message}"); }
    }
    private static RecurrenceOccurrence Occurrence(RecurrenceTemplate template, RecurrenceDefinition definition, RecurrenceCandidate candidate, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(), UserId = template.UserId, TemplateId = template.Id, DefinitionId = definition.Id, AppliedDefinitionId = definition.Id, LocalDate = candidate.LocalDate, TimeZoneId = candidate.TimeZoneId,
        DueTime = candidate.DueTime, DueAt = candidate.DueAt, TimeAdjusted = candidate.Adjusted, State = candidate.Skipped ? OccurrenceState.Skipped : OccurrenceState.Materialized, Reason = candidate.Reason, CreatedAt = now
    };
    private static void Apply(TaskItem task, RecurringTaskDefaults fields, DateTimeOffset? deadline)
    {
        task.Title = fields.Title; task.Description = fields.Description; task.Priority = fields.Priority; task.DirectEstimatedSeconds = fields.EstimatedSeconds; task.CanSplit = fields.CanSplit; task.PoolId = fields.PoolId; task.EnergyDemand = fields.EnergyDemand; task.DeadlineAt = deadline;
    }
}
