using Adhd.Domain.Planning;
using Adhd.Domain.Work;

namespace Adhd.Domain.Scheduling;

internal sealed partial class SchedulingRun
{
    private sealed record Allocation(List<SchedulingBlock> Blocks, decimal Remaining);
    private void PlaceAdvanced(int i)
    {
        attempted[i] = true; var task = tasks[i]; var policy = snapshot.Policy!; var earliest = projection.StartReadyAt(i); var preferred = earliest;
        foreach (var order in OrdersFor(task.Id)) if (projection.Completion(order.BeforeId) is { } end && end > preferred) preferred = end;
        var holds = policy.PreserveExisting ? SoftHolds(i).ToArray() : [];
        var chosen = Allocate(i, preferred, Deadline(i), holds);
        if (chosen.Remaining > 0)
        {
            var fallback = Allocate(i, earliest, Deadline(i), []);
            if (fallback.Remaining < chosen.Remaining) chosen = fallback;
        }
        UnplacedReason? failure = null;
        if (chosen.Remaining > 0)
        {
            var unconstrained = Allocate(i, earliest, null, []); var free = FreeFor(task.Id, [], []);
            var capacity = free.Sum(x => x.EndsAt > earliest ? WorkTime.Seconds(x.StartsAt > earliest ? x.StartsAt : earliest, x.EndsAt) : 0);
            var split = policy.EnableSplitting && task.CanSplit;
            failure = working.Length == 0 ? UnplacedReason.NoWorkingHours : unconstrained.Remaining == 0 ? UnplacedReason.DeadlineRisk
                : capacity >= demand[i] ? split ? UnplacedReason.MinimumSplitConstraint : UnplacedReason.NoContiguousSlot : UnplacedReason.InsufficientCapacity;
        }
        foreach (var block in chosen.Blocks)
        {
            blocks.Add(block); occupied.Add(new(block.StartsAt, block.EndsAt));
            explanations.Add(new(block.ExistingScheduleId.HasValue ? "ExistingPlacementKept" : "PlacedFragment", task.Id, WorkTime.Seconds(block.StartsAt, block.EndsAt)));
        }
        if (chosen.Remaining == 0)
        {
            var end = chosen.Blocks.Select(x => x.EndsAt).Append(coveredEnd[i]).Max();
            if (task.OutsideReservedSeconds == 0 || task.OutsideCompletionAt.HasValue) projection.CompleteOwn(i, end);
            return;
        }
        unplaced.Add(new(task.Id, chosen.Remaining, failure!.Value));
    }
    private Allocation Allocate(int i, DateTimeOffset earliest, DateTimeOffset? deadline, SchedulingBlock[] holds)
    {
        var task = tasks[i]; var policy = snapshot.Policy!; var split = policy.EnableSplitting && task.CanSplit;
        var result = new List<SchedulingBlock>(); var remaining = demand[i];
        if (policy.PreserveExisting)
        {
            foreach (var original in snapshot.ExistingBlocks.Where(x => x.TaskId == task.Id && x.Kind == ScheduleKind.Work && !x.IsFixed && !x.IsLocked && !x.IsActive && x.StartsAt >= anchor)
                         .OrderBy(x => x.StartsAt).ThenBy(x => x.ExistingScheduleId))
            {
                if (remaining == 0) break;
                var free = FreeFor(task.Id, holds, result); var start = original.StartsAt.ToUniversalTime();
                if (start < earliest || deadline < start) continue;
                var available = free.SingleOrDefault(x => x.StartsAt <= start && x.EndsAt > start);
                if (available is null) continue;
                var end = original.EndsAt < available.EndsAt ? original.EndsAt.ToUniversalTime() : available.EndsAt;
                if (deadline is { } due && due < end) end = due;
                if (end <= start) continue;
                var capacity = WorkTime.Seconds(start, end); var take = Math.Min(capacity, remaining);
                if ((!split && take < remaining) || (split && take < remaining && take < policy.MinimumSplitSeconds)) continue;
                result.Add(original with { StartsAt = start, EndsAt = Add(start, take), IsPreserved = false }); remaining -= take;
            }
        }
        if (remaining == 0) return new(result, 0);
        earliest = NewEarliest(earliest);
        var gaps = FreeFor(task.Id, holds, result);
        if (!split)
        {
            var slot = SchedulingIntervals.Find(gaps, earliest, deadline, remaining);
            if (slot is not null) { result.Add(new(null, task.Id, ScheduleKind.Work, slot.StartsAt, slot.EndsAt, IsAutomatic: true)); remaining = 0; }
        }
        else foreach (var gap in gaps)
        {
            if (remaining == 0) break;
            var start = gap.StartsAt > earliest ? gap.StartsAt : earliest; var end = deadline is { } due && due < gap.EndsAt ? due : gap.EndsAt;
            if (end <= start) continue;
            var take = Math.Min(remaining, WorkTime.Seconds(start, end));
            if (take < remaining && take < policy.MinimumSplitSeconds) continue;
            result.Add(new(null, task.Id, ScheduleKind.Work, start, Add(start, take), IsAutomatic: true)); remaining -= take;
        }
        return new(result, remaining);
    }
    private SchedulingWindow[] FreeFor(Guid taskId, IEnumerable<SchedulingBlock> holds, IReadOnlyCollection<SchedulingBlock> trial)
    {
        var policy = snapshot.Policy!; var exclusions = new List<SchedulingWindow>(occupied);
        exclusions.AddRange(trial.Select(x => new SchedulingWindow(x.StartsAt, x.EndsAt)));
        foreach (var block in holds) exclusions.Add(new(block.StartsAt, block.EndsAt));
        if (policy.TransitionSeconds > 0)
            foreach (var block in blocks.Concat(trial).Concat(holds).Concat(snapshot.ExternalWorkBlocks ?? []).Where(x => x.Kind == ScheduleKind.Work && x.TaskId != taskId))
            {
                // Bloklar 2 ile 9998 yılları arasında. Sınırı bir gün genişletmek güvenli
                exclusions.Add(new(block.StartsAt.AddSeconds(-policy.TransitionSeconds), block.EndsAt.AddSeconds(policy.TransitionSeconds)));
            }
        return SchedulingIntervals.Free(working, exclusions);
    }
    private IEnumerable<SchedulingBlock> SoftHolds(int selectedIndex)
    {
        var policy = snapshot.Policy!;
        foreach (var block in snapshot.ExistingBlocks)
        {
            if (block.TaskId is not { } id || id == tasks[selectedIndex].Id || block.Kind != ScheduleKind.Work || block.IsFixed || block.IsLocked || block.IsActive || block.StartsAt < anchor) continue;
            var i = index[id]; if (!selected.Contains(id) || attempted[i] || demand[i] <= 0 || !projection.Started(i) || block.StartsAt < projection.StartReadyAt(i)) continue;
            var end = block.EndsAt.ToUniversalTime(); if (Deadline(i) is { } due && end > due) end = due;
            if (end <= block.StartsAt || !working.Any(x => x.StartsAt <= block.StartsAt && x.EndsAt >= end)) continue;
            var capacity = WorkTime.Seconds(block.StartsAt, end);
            if ((!tasks[i].CanSplit || !policy.EnableSplitting) && capacity < demand[i]) continue;
            if (tasks[i].CanSplit && policy.EnableSplitting && capacity < demand[i] && capacity < policy.MinimumSplitSeconds) continue;
            var seconds = Math.Min(capacity, demand[i]); yield return block with { EndsAt = Add(block.StartsAt, seconds) };
        }
    }
    private void AddTransitionBuffers()
    {
        var seconds = snapshot.Policy!.TransitionSeconds; if (seconds == 0) return;
        var local = blocks.Where(x => x.Kind == ScheduleKind.Work).ToArray();
        var work = local.Concat(snapshot.ExternalWorkBlocks ?? []).OrderBy(x => x.StartsAt).ThenBy(x => x.EndsAt).ThenBy(x => x.TaskId).ToArray();
        foreach (var current in local.Where(x => x.StartsAt >= anchor))
        {
            if (work.Any(x => !ReferenceEquals(x, current) && x.StartsAt < current.StartsAt && x.EndsAt > current.StartsAt)) continue;
            var previous = work.Where(x => x.EndsAt <= current.StartsAt).OrderByDescending(x => x.EndsAt).FirstOrDefault();
            if (previous is null) continue;
            var frontier = work.Where(x => x.EndsAt == previous.EndsAt).ToArray();
            if (frontier.All(x => x.TaskId == current.TaskId)) continue;
            if (current.StartsAt - previous.EndsAt < TimeSpan.FromSeconds(seconds)) { warnings.Add(new("TransitionGapMissing", current.TaskId)); continue; }
            var start = current.StartsAt.AddSeconds(-seconds);
            var spans = working.Select(x => new SchedulingWindow(x.StartsAt > start ? x.StartsAt : start, x.EndsAt < current.StartsAt ? x.EndsAt : current.StartsAt));
            var unavailable = blocks.Select(x => new SchedulingWindow(x.StartsAt, x.EndsAt)).Concat(snapshot.ExternalBusyWindows ?? []);
            foreach (var gap in SchedulingIntervals.Free(spans, unavailable))
                blocks.Add(new(null, null, ScheduleKind.Buffer, gap.StartsAt, gap.EndsAt, IsAutomatic: true));
        }
    }
    private static DateTimeOffset Add(DateTimeOffset start, decimal seconds) => start.AddTicks(checked((long)(seconds * TimeSpan.TicksPerSecond)));
}
