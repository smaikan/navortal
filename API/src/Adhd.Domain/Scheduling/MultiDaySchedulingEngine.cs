using System.Collections.Immutable;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;

namespace Adhd.Domain.Scheduling;

public sealed record DistributionSnapshot(ImmutableArray<SchedulingSnapshot> Days, ImmutableArray<Guid> TaskIds, ImmutableArray<SchedulingBlock> OutsideBlocks, DateTimeOffset? NewWorkNotBefore = null);
public sealed record DistributedDay(DateOnly LocalDate, string TimeZoneId, SchedulingProposal Proposal);
public sealed record DistributionProposal(long InputPlanningVersion, DateTimeOffset ServerNow, string AlgorithmVersion, ImmutableArray<DistributedDay> Days,
    ImmutableArray<UnplacedWork> Unplaced, bool HasConstraintConflicts);

// Tek kalan miktarı açıkça seçilen yerel günlere dağıtır.
public sealed class MultiDaySchedulingEngine(SchedulingEngine engine)
{
    public DistributionProposal Generate(DistributionSnapshot input)
    {
        if (input.Days.IsDefaultOrEmpty || input.Days.Length > 31 || input.TaskIds.IsDefaultOrEmpty || input.OutsideBlocks.IsDefault) throw new ArgumentException("Explicit days and tasks are required.");
        var days = input.Days.OrderBy(x => x.LocalDate).ToArray(); var first = days[0];
        if (days.Select(x => x.LocalDate).Distinct().Count() != days.Length || days.Any(x => x.ServerNow != first.ServerNow || x.PlanningVersion != first.PlanningVersion)) throw new ArgumentException("Distribution snapshots must share one instant and version.");
        var selected = SchedulingSelection.Expand(first.Tasks, input.TaskIds); var results = new List<DistributedDay>();
        var outsideActiveConflict = input.OutsideBlocks.Where(x => x.IsActive && x.TaskId.HasValue).Select(block =>
        {
            var task = first.Tasks.Single(x => x.Id == block.TaskId);
            var remaining = task.EstimatedSeconds is { } estimate ? Math.Max(0, estimate - task.ActualSeconds) : (decimal?)null;
            var amount = WorkTime.Seconds(block.StartsAt > first.ServerNow ? block.StartsAt : first.ServerNow, block.EndsAt);
            return remaining is null or <= 0 ? new SchedulingMessage("ActiveOutsideEndUnknown", task.Id)
                : remaining > amount ? new SchedulingMessage("ActiveOutsideReservationTooShort", task.Id, remaining - amount) : null;
        }).Where(x => x is not null).Select(x => x!).ToArray();
        var protectedByDay = days.Select(s => s.ExistingBlocks.Where(b => b.IsFixed || b.IsLocked || b.IsActive || b.TaskId is { } task && !selected.Contains(task)
            || b.Kind != ScheduleKind.Work && !(b.Kind == ScheduleKind.Buffer && b.IsAutomatic && s.Policy is not null)).ToArray()).ToArray();
        for (var i = 0; i < days.Length; i++)
        {
            var day = days[i];
            // Bu öneride daha önce yerleştirdiğimiz işler eski esnek bloklarının yerini alır.
            // Korunan ileriki saatleri baştan ayır ki önceki günler bu süreyi tüketmesin
            var outside = input.OutsideBlocks.Concat(results.SelectMany(x => x.Proposal.Blocks)).Concat(protectedByDay.Skip(i + 1).SelectMany(x => x))
                .Where(x => x.EndsAt > first.ServerNow).ToArray();
            var work = outside.Where(x => x.Kind == ScheduleKind.Work && x.TaskId.HasValue).ToLookup(x => x.TaskId!.Value);
            var tasks = day.Tasks.Select(t =>
            {
                var held = work[t.Id].ToArray(); var amount = held.Sum(x => WorkTime.Seconds(x.StartsAt > first.ServerNow ? x.StartsAt : first.ServerNow, x.EndsAt));
                return t with { OutsideReservedSeconds = amount, OutsideCompletionAt = held.Length == 0 ? null : held.Max(x => x.EndsAt) };
            }).ToImmutableArray();
            var start = PlanTime.DayStart(day.LocalDate, day.TimeZoneId); var end = PlanTime.DayStart(day.LocalDate.AddDays(1), day.TimeZoneId);
            var busy = SchedulingIntervals.Union(outside.Select(x => new SchedulingWindow(x.StartsAt > start ? x.StartsAt : start, x.EndsAt < end ? x.EndsAt : end))).ToImmutableArray();
            var result = engine.Generate(day with { Tasks = tasks, ExternalBusyWindows = busy, ExternalWorkBlocks = outside.Where(x => x.Kind == ScheduleKind.Work).ToImmutableArray() }, new(input.TaskIds, NewWorkNotBefore: input.NewWorkNotBefore));
            results.Add(new(day.LocalDate, day.TimeZoneId, result));
        }
        if (outsideActiveConflict.Length > 0) results[0] = results[0] with { Proposal = results[0].Proposal with { HasConstraintConflicts = true, Warnings = results[0].Proposal.Warnings.AddRange(outsideActiveConflict) } };
        return new(first.PlanningVersion, first.ServerNow, "distribution-v1", results.ToImmutableArray(), results[^1].Proposal.Unplaced, results.Any(x => x.Proposal.HasConstraintConflicts));
    }
}
