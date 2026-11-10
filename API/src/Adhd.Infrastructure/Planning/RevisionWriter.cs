using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

internal sealed record PlanDelta(TaskSchedule Schedule, ScheduleView? Before, string Type, Guid? AffectedPlanId = null, ScheduleView? After = null)
{
    internal Guid PlanId => AffectedPlanId ?? Schedule.DailyPlanId;
}
// Saatsiz öğe değişikliği aynı plan geçmişine yazılır. PlanId etkilenen günün planıdır. Bkz. PlanId
internal sealed record DayDelta(DayItem Item, DayItemSnapshot? Before, string Type, Guid PlanId, DayItemSnapshot? After = null);
internal static class RevisionWriter
{
    internal static DayItemSnapshot Snapshot(DayItem d) => new(d.Id, d.LocalDate, d.TaskId, d.SortOrder, d.State, d.CompletedAt, d.Version, d.ScheduleId, d.StartsAt, d.EndsAt, d.IsUrgent, d.TimingIssue, d.GroupTaskId, d.GroupParentTaskId);
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    internal static ScheduleView View(TaskSchedule s) => new(s.Id, s.DailyPlanId, s.TaskId, s.Kind, s.State, s.StartsAt, s.EndsAt, s.IsFixed, s.IsLocked, s.SplitGroupId, s.OriginScheduleId, s.Version,
        s.TaskSnapshot is null ? null : JsonSerializer.Deserialize<PlanningTaskSnapshot>(s.TaskSnapshot, Json), s.IsAutomatic, s.CompletedAt);
    internal static RevisionView View(PlanRevision r) => new(r.Id, r.DailyPlanId, r.Number, r.PreviousRevisionId, r.ChangeSetId, r.Trigger, r.Reason, r.CreatedAt, r.EffectiveAt, r.AlgorithmVersion, r.SnapshotSchemaVersion, r.ReversesChangeSetId);
    internal static async Task<Guid[]> Write(PlannerDbContext db, Guid userId, IReadOnlyCollection<PlanDelta> deltas, DateTimeOffset now, string trigger, string reason, Guid changeSet, bool acceptConflicts, CancellationToken ct, string algorithmVersion = "manual-v1", Guid? reversesChangeSetId = null, IReadOnlyCollection<DayDelta>? dayDeltas = null, IReadOnlyCollection<Guid>? touchedPlanIds = null)
    {
        dayDeltas ??= [];
        if (deltas.Count == 0 && dayDeltas.Count == 0 && (touchedPlanIds?.Count ?? 0) == 0) return [];
        // Current ve baseline birbirini gösteriyor. Aradaki kayıtlar aynı işlemde kalsın.
        await db.SaveChangesAsync(ct);
        var planIds = deltas.Select(x => x.PlanId).Concat(dayDeltas.Select(x => x.PlanId)).Concat(touchedPlanIds ?? []).Distinct().ToArray();
        var plans = await db.DailyPlans.Where(x => x.UserId == userId && planIds.Contains(x.Id)).ToArrayAsync(ct);
        var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && planIds.Contains(x.DailyPlanId) && x.State == ScheduleState.Planned).ToArrayAsync(ct);
        var dates = plans.Select(x => x.LocalDate).ToArray();
        var dayItems = await db.DayItems.Where(x => x.UserId == userId && dates.Contains(x.LocalDate) && x.State != DayItemState.Removed).ToArrayAsync(ct);
        var revisions = new List<PlanRevision>();
        foreach (var plan in plans)
        {
            var revision = new PlanRevision { Id = Guid.CreateVersion7(), UserId = userId, DailyPlanId = plan.Id, Number = plan.CurrentRevisionId is null ? 1 : plan.Version + 1,
                PreviousRevisionId = plan.CurrentRevisionId, ChangeSetId = changeSet, ReversesChangeSetId = reversesChangeSetId, Trigger = trigger, Reason = reason, CreatedAt = now, EffectiveAt = now, AlgorithmVersion = algorithmVersion };
            db.PlanRevisions.Add(revision); revisions.Add(revision);
            foreach (var block in blocks.Where(x => x.DailyPlanId == plan.Id)) db.PlanRevisionItems.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, RevisionId = revision.Id, ScheduleId = block.Id, Snapshot = JsonSerializer.Serialize(View(block), Json) });
            foreach (var delta in deltas.Where(x => x.PlanId == plan.Id)) db.PlanRevisionChanges.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, RevisionId = revision.Id, ScheduleId = delta.Schedule.Id, Type = delta.Type,
                Before = delta.Before is null ? null : JsonSerializer.Serialize(delta.Before, Json), After = JsonSerializer.Serialize(delta.After ?? View(delta.Schedule), Json), ConflictsAccepted = acceptConflicts });
            foreach (var item in dayItems.Where(x => x.LocalDate == plan.LocalDate)) db.PlanRevisionDayItems.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, RevisionId = revision.Id, DayItemId = item.Id, Snapshot = JsonSerializer.Serialize(Snapshot(item), Json) });
            foreach (var delta in dayDeltas.Where(x => x.PlanId == plan.Id)) db.PlanRevisionChanges.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, RevisionId = revision.Id, DayItemId = delta.Item.Id, Type = delta.Type,
                Before = delta.Before is null ? null : JsonSerializer.Serialize(delta.Before, Json), After = JsonSerializer.Serialize(delta.After ?? Snapshot(delta.Item), Json) });
        }
        await db.SaveChangesAsync(ct);
        foreach (var plan in plans)
        {
            var revision = revisions.Single(x => x.DailyPlanId == plan.Id); plan.CurrentRevisionId = revision.Id; plan.Version = revision.Number;
            if (plan.BaselineRevisionId is null && (blocks.Any(x => x.DailyPlanId == plan.Id && x.Kind == ScheduleKind.Work) || dayItems.Any(x=>x.LocalDate==plan.LocalDate && x.State==DayItemState.Planned && x.EndsAt.HasValue))) plan.BaselineRevisionId = revision.Id;
        }
        await db.SaveChangesAsync(ct); return revisions.Select(x => x.Id).ToArray();
    }
}
