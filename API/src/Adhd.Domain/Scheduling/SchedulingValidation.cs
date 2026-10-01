using Adhd.Domain.Planning;

namespace Adhd.Domain.Scheduling;

internal sealed partial class SchedulingRun
{
    private static void Validate(SchedulingSnapshot s, SchedulingIntent intent)
    {
        if (s.Tasks.IsDefault || s.Dependencies.IsDefault || s.Ordering.IsDefault || s.WorkingWindows.IsDefault || s.ExistingBlocks.IsDefault || intent.TaskIds.IsDefault
            || s.LocalDate.Year is < 2 or > 9998 || s.PlanningVersion < 0 || !Enum.IsDefined(intent.Kind)) throw Invalid();
        if (s.Policy is { } policy && (policy.MinimumSplitSeconds is < 1 or > 86400 || policy.TransitionSeconds is < 0 or > 86400)) throw Invalid();
        if (s.AvailableEnergy.HasValue && !Enum.IsDefined(s.AvailableEnergy.Value) || s.Tasks.Any(t => t.EnergyDemand.HasValue && !Enum.IsDefined(t.EnergyDemand.Value))) throw Invalid();
        var ids = s.Tasks.Select(x => x.Id).ToHashSet();
        if (ids.Count != s.Tasks.Length || ids.Contains(Guid.Empty) || intent.TaskIds.Any(x => !ids.Contains(x))) throw Invalid();
        foreach (var t in s.Tasks)
            if ((t.ParentTaskId.HasValue && !ids.Contains(t.ParentTaskId.Value)) || (!t.HasDirectWork && (t.EstimatedSeconds.HasValue || t.DirectWorkCompleted || t.OutsideReservedSeconds != 0))
                || t.EstimatedSeconds < 0 || t.ActualSeconds < 0 || t.ActualSeconds > long.MaxValue || t.OutsideReservedSeconds < 0 || t.OutsideReservedSeconds > long.MaxValue
                || decimal.Round(t.ActualSeconds, 6) != t.ActualSeconds || decimal.Round(t.OutsideReservedSeconds, 6) != t.OutsideReservedSeconds
                || (t.OutsideReservedSeconds > 0 && t.OutsideCompletionAt < s.ServerNow)
                || !Enum.IsDefined(t.State) || !Enum.IsDefined(t.Priority)) throw Invalid();
        if (s.Dependencies.Any(x => !ids.Contains(x.PredecessorId) || !ids.Contains(x.SuccessorId)) || s.Ordering.Any(x => !ids.Contains(x.BeforeId) || !ids.Contains(x.AfterId))) throw Invalid();
        var children = s.Tasks.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var roots = new Queue<Guid>(s.Tasks.Where(x => x.ParentTaskId is null).Select(x => x.Id)); var visited = 0;
        while (roots.TryDequeue(out var id)) { visited++; foreach (var child in children[id]) roots.Enqueue(child.Id); }
        if (visited != s.Tasks.Length || !TimeZoneInfo.TryFindSystemTimeZoneById(s.TimeZoneId, out _)) throw Invalid();
        var start = PlanTime.DayStart(s.LocalDate, s.TimeZoneId); var end = PlanTime.DayStart(s.LocalDate.AddDays(1), s.TimeZoneId);
        var blockIds = s.ExistingBlocks.Where(x => x.ExistingScheduleId.HasValue).Select(x => x.ExistingScheduleId!.Value).ToArray();
        if (blockIds.Distinct().Count() != blockIds.Length || blockIds.Contains(Guid.Empty) || s.ExistingBlocks.Count(x => x.IsActive) > 1) throw Invalid();
        if (s.WorkingWindows.Any(x => x.StartsAt >= x.EndsAt)) throw Invalid();
        if (s.ExternalBusyWindows is { } busy && (busy.IsDefault || busy.Any(x => x.StartsAt >= x.EndsAt || x.StartsAt < start || x.EndsAt > end))) throw Invalid();
        if (s.ExternalWorkBlocks is { } work && (work.IsDefault || work.Any(x => x.Kind != ScheduleKind.Work || x.TaskId is null || !ids.Contains(x.TaskId.Value) || x.StartsAt >= x.EndsAt))) throw Invalid();
        foreach (var b in s.ExistingBlocks)
            if (b.StartsAt < start || b.EndsAt > end || b.StartsAt >= b.EndsAt || !Enum.IsDefined(b.Kind)
                || (b.ExistingScheduleId is null && !b.IsActive) || b.IsPreserved
                || (b.Kind == ScheduleKind.Work ? b.TaskId is null || !ids.Contains(b.TaskId.Value) : b.TaskId.HasValue || b.IsActive)) throw Invalid();
    }
    private static ArgumentException Invalid() => new("Invalid scheduling snapshot or intent.");
}
