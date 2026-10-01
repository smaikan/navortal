using System.Collections.Immutable;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;

namespace Adhd.Domain.Scheduling;

public sealed class SchedulingEngine
{
    public SchedulingProposal Generate(SchedulingSnapshot snapshot, SchedulingIntent intent) => new SchedulingRun(snapshot, intent).Generate();
}

internal sealed partial class SchedulingRun
{
    private readonly SchedulingSnapshot snapshot;
    private readonly SchedulingIntent intent;
    private readonly SchedulingTask[] tasks;
    private readonly Dictionary<Guid, int> index;
    private readonly HashSet<Guid> selected;
    private readonly DateTimeOffset anchor;
    private readonly DateTimeOffset dayEnd;
    private readonly SchedulingWindow[] working;
    private readonly List<SchedulingWindow> occupied = new();
    private readonly List<SchedulingBlock> blocks = new();
    private readonly List<UnplacedWork> unplaced = new();
    private readonly List<SchedulingMessage> warnings = new();
    private readonly List<SchedulingMessage> explanations = new();
    private readonly decimal[] demand;
    private readonly DateTimeOffset[] coveredEnd;
    private readonly bool[] attempted;
    private readonly SchedulingProjection projection;
    private readonly DateTimeOffset?[] latestCompletion;
    private bool conflicts;

    internal SchedulingRun(SchedulingSnapshot source, SchedulingIntent command)
    {
        Validate(source, command); snapshot = source; intent = command;
        tasks = source.Tasks.OrderBy(x => x.Id).ToArray(); index = tasks.Select((t, i) => (t.Id, i)).ToDictionary(x => x.Id, x => x.i);
        selected = Select(); var dayStart = PlanTime.DayStart(source.LocalDate, source.TimeZoneId); dayEnd = PlanTime.DayStart(source.LocalDate.AddDays(1), source.TimeZoneId);
        var now = source.ServerNow.ToUniversalTime(); anchor = now < dayStart ? dayStart : now > dayEnd ? dayEnd : now;
        working = SchedulingIntervals.Union(source.WorkingWindows.Select(x => new SchedulingWindow(x.StartsAt > anchor ? x.StartsAt.ToUniversalTime() : anchor, x.EndsAt < dayEnd ? x.EndsAt.ToUniversalTime() : dayEnd)));
        Preserve(); demand = new decimal[tasks.Length]; coveredEnd = Enumerable.Repeat(anchor, tasks.Length).ToArray(); attempted = new bool[tasks.Length];
        var ownReady = ResolveWork(); projection = new(tasks, source.Dependencies.ToArray(), anchor, ownReady, coveredEnd);
        latestCompletion = projection.LatestCompletions(blocks.Where(x => x.TaskId.HasValue && x.EndsAt > anchor).Select(x => (x.TaskId!.Value, x.StartsAt > anchor ? x.StartsAt : anchor)));
        if (working.Length == 0) warnings.Add(new("NoWorkingHours"));
    }
    internal SchedulingProposal Generate()
    {
        while (true)
        {
            var candidates = Enumerable.Range(0, tasks.Length).Where(i => demand[i] > 0 && !attempted[i] && projection.Started(i))
                .OrderBy(i => Slack(i)).ThenByDescending(i => tasks[i].IsCritical).ThenByDescending(i => tasks[i].Priority)
                .ThenBy(i => SoftPending(i)).ThenBy(i => Adhd.Domain.Support.SupportRules.EnergyPenalty(tasks[i].EnergyDemand, snapshot.AvailableEnergy)).ThenBy(i => tasks[i].SortOrder).ThenBy(i => tasks[i].Id).ToArray();
            if (candidates.Length == 0) break;
            Place(candidates[0]);
        }
        for (var i = 0; i < tasks.Length; i++)
            if (demand[i] > 0 && !attempted[i]) unplaced.Add(new(tasks[i].Id, demand[i], UnplacedReason.DependencyBlocked));
        if (snapshot.Policy is not null) AddTransitionBuffers();
        CheckProtectedReadiness(); CheckSoftResults(); CheckInvariants();
        return new(snapshot.LocalDate, snapshot.PlanningVersion, anchor, snapshot.AvailableEnergy.HasValue ? "heuristic-v3" : snapshot.Policy is null ? "heuristic-v1" : "heuristic-v2",
            blocks.OrderBy(x => x.StartsAt).ThenBy(x => x.EndsAt).ThenBy(x => x.ExistingScheduleId).ThenBy(x => x.TaskId).ThenBy(x => x.Kind).ToImmutableArray(),
            unplaced.OrderBy(x => x.TaskId).ToImmutableArray(), Messages(warnings), Messages(explanations), conflicts);
    }
    private void Place(int i)
    {
        if (snapshot.Policy is not null) { PlaceAdvanced(i); return; }
        attempted[i] = true; var task = tasks[i]; var free = SchedulingIntervals.Free(working, occupied); var earliest = projection.StartReadyAt(i);
        var preferred = earliest;
        foreach (var order in OrdersFor(task.Id)) if (projection.Completion(order.BeforeId) is { } end && end > preferred) preferred = end;
        earliest = NewEarliest(earliest); preferred = NewEarliest(preferred);
        var slot = SchedulingIntervals.Find(free, preferred, Deadline(i), demand[i]) ?? SchedulingIntervals.Find(free, earliest, Deadline(i), demand[i]);
        if (slot is null)
        {
            var reason = working.Length == 0 ? UnplacedReason.NoWorkingHours
                : SchedulingIntervals.Find(free, earliest, null, demand[i]) is not null ? UnplacedReason.DeadlineRisk
                : free.Sum(x => x.EndsAt > earliest ? WorkTime.Seconds(x.StartsAt > earliest ? x.StartsAt : earliest, x.EndsAt) : 0) >= demand[i]
                    ? UnplacedReason.NoContiguousSlot : UnplacedReason.InsufficientCapacity;
            unplaced.Add(new(task.Id, demand[i], reason)); return;
        }
        blocks.Add(new(null, task.Id, ScheduleKind.Work, slot.StartsAt, slot.EndsAt)); occupied.Add(slot);
        if (task.OutsideReservedSeconds == 0 || task.OutsideCompletionAt.HasValue)
            projection.CompleteOwn(i, slot.EndsAt > coveredEnd[i] ? slot.EndsAt : coveredEnd[i]);
        explanations.Add(new("PlacedContiguously", task.Id, demand[i]));
    }
    private bool[] ResolveWork()
    {
        var ready = new bool[tasks.Length]; var children = tasks.Where(x => !x.IsArchived && x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var reserved = blocks.Where(x => x.Kind == ScheduleKind.Work && x.TaskId.HasValue && x.EndsAt > anchor).ToLookup(x => x.TaskId!.Value);
        for (var i = 0; i < tasks.Length; i++)
        {
            var task = tasks[i]; var held = reserved[task.Id].ToArray(); var seconds = held.Sum(x => WorkTime.Seconds(x.StartsAt > anchor ? x.StartsAt : anchor, x.EndsAt));
            coveredEnd[i] = held.Select(x => x.EndsAt).Append(task.OutsideCompletionAt?.ToUniversalTime() ?? anchor).Max();
            ready[i] = task.DirectWorkCompleted || (!task.HasDirectWork && children[task.Id].Any());
            if (task.State == TaskState.Completed || !task.HasDirectWork || task.DirectWorkCompleted) continue;
            var isSelected = selected.Contains(task.Id); var active = !task.IsArchived && task.State is TaskState.Pending or TaskState.InProgress or TaskState.Paused;
            decimal? remaining = task.EstimatedSeconds is { } estimate ? Math.Max(0, estimate - task.ActualSeconds) : null;
            if (!active) { if (isSelected) unplaced.Add(new(task.Id, remaining, UnplacedReason.TaskInactive)); continue; }
            var coverage = seconds + task.OutsideReservedSeconds;
            if (remaining is { } known && coverage > known) { conflicts = true; warnings.Add(new("ReservedExceedsRemaining", task.Id, coverage - known)); }
            if (task.OutsideReservedSeconds > 0 && task.OutsideCompletionAt is null) warnings.Add(new("OutsideCompletionUnknown", task.Id));
            if (remaining is null || remaining == 0)
            {
                if (isSelected) unplaced.Add(new(task.Id, remaining, remaining is null ? UnplacedReason.NoEstimate : UnplacedReason.NeedsEstimateExtension));
                if (snapshot.ExistingBlocks.Any(x => x.IsActive && x.TaskId == task.Id)) BlockUncertainActive(task.Id);
                continue;
            }
            var needed = Math.Max(0, remaining.Value - coverage);
            if (needed == 0 && (task.OutsideReservedSeconds == 0 || task.OutsideCompletionAt.HasValue)) ready[i] = true;
            if (isSelected && needed == 0) explanations.Add(new("AlreadyReserved", task.Id, remaining));
            if (snapshot.ExistingBlocks.Any(x => x.IsActive && x.TaskId == task.Id) && needed > 0) { BlockUncertainActive(task.Id, "ActiveReservationTooShort"); if (isSelected) unplaced.Add(new(task.Id, needed, UnplacedReason.ActiveReservationTooShort)); continue; }
            if (isSelected) demand[i] = needed;
        }
        return ready;
    }
    private void Preserve()
    {
        occupied.AddRange(snapshot.ExternalBusyWindows ?? []);
        foreach (var original in snapshot.ExistingBlocks.OrderBy(x => x.StartsAt).ThenBy(x => x.ExistingScheduleId).ThenBy(x => x.TaskId))
        {
            var block = original with { StartsAt = original.StartsAt.ToUniversalTime(), EndsAt = original.EndsAt.ToUniversalTime(), IsPreserved = true };
            var regenerateBuffer = snapshot.Policy is not null && block.IsAutomatic && block.Kind == ScheduleKind.Buffer;
            var keep = block.IsFixed || block.IsLocked || block.IsActive || (block.Kind != ScheduleKind.Work && !regenerateBuffer) || (block.TaskId.HasValue && !selected.Contains(block.TaskId.Value));
            if (block.EndsAt <= anchor || keep) blocks.Add(block);
            else if (block.StartsAt < anchor) blocks.Add(block with { EndsAt = anchor });
        }
        var future = blocks.Where(x => x.EndsAt > anchor).OrderBy(x => x.StartsAt).ThenBy(x => x.EndsAt).ToArray(); DateTimeOffset? maxEnd = null;
        foreach (var block in future)
        {
            if ((snapshot.ExternalBusyWindows ?? []).Any(x => x.StartsAt < block.EndsAt && block.StartsAt < x.EndsAt)) { conflicts = true; warnings.Add(new("ProtectedExternalConflict", block.TaskId, ScheduleId: block.ExistingScheduleId)); }
            if (block.TaskId.HasValue && snapshot.Policy is { TransitionSeconds: > 0 } policy && (snapshot.ExternalWorkBlocks ?? []).Any(x => x.TaskId != block.TaskId
                && (x.EndsAt <= block.StartsAt && block.StartsAt - x.EndsAt < TimeSpan.FromSeconds(policy.TransitionSeconds)
                    || block.EndsAt <= x.StartsAt && x.StartsAt - block.EndsAt < TimeSpan.FromSeconds(policy.TransitionSeconds))))
            { conflicts = true; warnings.Add(new("ProtectedExternalTransition", block.TaskId, ScheduleId: block.ExistingScheduleId)); }
            if (maxEnd > (block.StartsAt > anchor ? block.StartsAt : anchor)) { conflicts = true; warnings.Add(new("ProtectedConflict", block.TaskId)); }
            if (maxEnd is null || block.EndsAt > maxEnd) maxEnd = block.EndsAt;
            occupied.Add(new(block.StartsAt > anchor ? block.StartsAt : anchor, block.EndsAt));
            if (block.IsActive && block.StartsAt > anchor)
            {
                occupied.Add(new(anchor, block.StartsAt)); conflicts = true; warnings.Add(new("ActiveBeforeReservation", block.TaskId));
            }
            if (block.TaskId is { } id && tasks[index[id]] is { } task && (!task.HasDirectWork || task.IsArchived || task.DirectWorkCompleted || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused)))
            { conflicts = true; warnings.Add(new("ProtectedInactiveTask", id)); }
        }
    }
    private void BlockUncertainActive(Guid id, string code = "ActiveEndUnknown")
    {
        conflicts = true; warnings.Add(new(code, id)); if (anchor < dayEnd) occupied.Add(new(anchor, dayEnd));
    }
    private DateTimeOffset? Deadline(int i) => tasks[i].DeadlineAt is { } deadline && (latestCompletion[i] is null || deadline < latestCompletion[i]) ? deadline : latestCompletion[i];
    private DateTimeOffset NewEarliest(DateTimeOffset earliest) => intent.NewWorkNotBefore is { } lead && lead > earliest ? lead.ToUniversalTime() : earliest;
    private decimal Slack(int i) => Deadline(i) is { } deadline ? (deadline - projection.StartReadyAt(i)).Ticks / (decimal)TimeSpan.TicksPerSecond - demand[i] : decimal.MaxValue;
    private int SoftPending(int i) => OrdersFor(tasks[i].Id).Count(x => projection.Completion(x.BeforeId) is null);
    private IEnumerable<SchedulingOrder> OrdersFor(Guid id)
    {
        if (snapshot.Ordering.Length == 0) return [];
        var ancestors = new HashSet<Guid>(); Guid? current = id;
        while (current is { } at && ancestors.Add(at)) current = tasks[index[at]].ParentTaskId;
        return snapshot.Ordering.Where(x => ancestors.Contains(x.AfterId));
    }
    private void CheckProtectedReadiness()
    {
        foreach (var block in blocks.Where(x => x.Kind == ScheduleKind.Work && x.TaskId.HasValue && x.EndsAt > anchor))
        {
            var i = index[block.TaskId!.Value];
            if (!projection.Started(i) || projection.StartReadyAt(i) > (block.StartsAt > anchor ? block.StartsAt : anchor))
            { conflicts = true; warnings.Add(new("ProtectedDependencyConflict", block.TaskId)); }
            if (Deadline(i) < block.EndsAt) { conflicts = true; warnings.Add(new("DeadlineRisk", block.TaskId)); }
        }
    }
    private void CheckSoftResults()
    {
        foreach (var order in snapshot.Ordering)
        {
            var starts = blocks.Where(x => x.TaskId.HasValue && IsInSubtree(x.TaskId.Value, order.AfterId) && x.EndsAt > anchor).Select(x => x.StartsAt > anchor ? x.StartsAt : anchor).ToArray();
            if (starts.Length > 0 && (projection.Completion(order.BeforeId) is not { } before || starts.Min() < before)) warnings.Add(new("OrderingPreferenceUnmet", order.AfterId));
        }
    }
    private bool IsInSubtree(Guid child, Guid root)
    {
        Guid? current = child; while (current is { } id) { if (id == root) return true; current = tasks[index[id]].ParentTaskId; } return false;
    }
    private HashSet<Guid> Select()
    {
        return SchedulingSelection.Expand(tasks, intent.TaskIds);
    }
    private void CheckInvariants()
    {
        var added = blocks.Where(x => !x.IsPreserved).ToArray();
        foreach (var block in added)
        {
            if (block.StartsAt < anchor || block.StartsAt >= block.EndsAt || !working.Any(x => x.StartsAt <= block.StartsAt && x.EndsAt >= block.EndsAt)
                || blocks.Any(x => !ReferenceEquals(x, block) && PlanTime.Overlaps(block.StartsAt, block.EndsAt, x.StartsAt, x.EndsAt)))
                throw new InvalidOperationException("Scheduling output violated interval invariants.");
        }
    }
    private static ImmutableArray<SchedulingMessage> Messages(IEnumerable<SchedulingMessage> source) => source.Distinct().OrderBy(x => x.Code, StringComparer.Ordinal).ThenBy(x => x.TaskId).ThenBy(x => x.Seconds).ToImmutableArray();
}
