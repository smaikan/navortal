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
        var held = existing.Select(x => x.LocalDate).ToHashSet(); var now = clock.GetUtcNow(); var made = 0;
        var order = await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0;
        for (var date = command.FromDate; date <= command.ToDate; date = date.AddDays(1))
        {
            if (held.Contains(date)) continue; var definition = Applicable(definitions, date); if (definition is null) continue;
            var rule = Read<RecurrenceRule>(definition.Rule); if (!RecurrenceRules.Matches(rule, date)) continue; var candidate = Candidate(rule, date); var fields = Read<RecurringTaskDefaults>(definition.TaskDefaults);
            var occurrence = Occurrence(template, definition, candidate, now); existing.Add(occurrence); db.RecurrenceOccurrences.Add(occurrence);
            if (candidate.Skipped) continue;
            await Pool(userId, fields, ct); order += 1024;
            var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now, SortOrder = order };
            Apply(task, fields, candidate.DueAt); occurrence.TaskId = task.Id; occurrence.SyncedTaskVersion = task.Version; db.Tasks.Add(task);
            TaskHistory.Append(db, task, "CreatedFromRecurrence", null, new { templateId = id, occurrenceId = occurrence.Id, definitionId = definition.Id, localDate = date, candidate.TimeZoneId, candidate.DueTime, candidate.Adjusted }); made++;
        }
        var planned = await AddAutomaticPlans(userId, existing.ToArray(), definitions, state.PlanningVersion, now, ct);
        if (made > 0 || planned > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = await Result(userId, template, await Head(userId, id, ct), existing.ToArray(), [], [], state.PlanningVersion, "recurrence-materialize", key, payload, ct); await tx.CommitAsync(ct); return result;
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
