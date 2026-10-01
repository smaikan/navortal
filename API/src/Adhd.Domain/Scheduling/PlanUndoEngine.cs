using System.Collections.Immutable;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;

namespace Adhd.Domain.Scheduling;

public sealed record UndoSchedule(Guid Id, Guid? TaskId, ScheduleKind Kind, ScheduleState State, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    bool IsFixed, bool IsLocked, bool IsAutomatic, long Version)
{
    public SchedulingBlock Block() => new(Id, TaskId, Kind, StartsAt, EndsAt, IsFixed, IsLocked, IsPreserved: true, IsAutomatic: IsAutomatic);
}
public sealed record UndoDelta(UndoSchedule? Before, UndoSchedule After);
public sealed record PlanUndoSnapshot(SchedulingSnapshot Current, SchedulingIntent Intent, ImmutableArray<UndoSchedule> Schedules, ImmutableArray<UndoDelta> Changes, bool AllowProtectedChange, Guid? ProtectedActiveTaskId = null);

// Sadece gelecekteki planı güvenli biçimde geri al. Çalışma geçmişi ve görev durumu kalır.
public sealed class PlanUndoEngine
{
    public SchedulingProposal Generate(PlanUndoSnapshot input)
    {
        var source = input.Current; var anchor = source.ServerNow;
        var dayStart = PlanTime.DayStart(source.LocalDate, source.TimeZoneId); if (anchor < dayStart) anchor = dayStart;
        var earliest = input.Intent.NewWorkNotBefore is { } lead && lead > anchor ? lead : anchor;
        var originals = input.Schedules.ToDictionary(x => x.Id);
        var current = input.Schedules.Where(x => x.State == ScheduleState.Planned).ToDictionary(x => x.Id, x => x.Block());
        var proposed = new Dictionary<Guid, SchedulingBlock>(current); var candidates = new HashSet<Guid>();
        var warnings = new List<SchedulingMessage>(); var explanations = new List<SchedulingMessage>();
        var tasks = source.Tasks.ToDictionary(x => x.Id); var active = source.ExistingBlocks.Where(x => x.IsActive).ToArray();
        void Warn(string code, UndoSchedule row, decimal? seconds = null) => warnings.Add(new(code, row.TaskId, seconds, row.Id));
        foreach (var change in input.Changes.OrderBy(x => x.After.Id))
        {
            var after = change.After;
            if (!originals.TryGetValue(after.Id, out var row)) throw new ArgumentException("Undo schedule source is missing.");
            if (row.Version != after.Version) { Warn("UndoScheduleChanged", row); continue; }
            if (row.TaskId.HasValue && input.ProtectedActiveTaskId == row.TaskId || active.Any(x => x.ExistingScheduleId == row.Id || row.TaskId.HasValue && x.TaskId == row.TaskId)) { Warn("UndoActiveWorkProtected", row); continue; }
            if (row.State == ScheduleState.Planned && (row.IsFixed || row.IsLocked) && !input.AllowProtectedChange) { Warn("UndoProtectedIntentRequired", row); continue; }
            var before = change.Before;
            if (before is null || before.State == ScheduleState.Removed)
            {
                if (row.State != ScheduleState.Planned || row.EndsAt <= anchor) { Warn("UndoHistoryPreserved", row); continue; }
                if (row.StartsAt < anchor) proposed[row.Id] = row.Block() with { EndsAt = anchor };
                else proposed.Remove(row.Id);
                candidates.Add(row.Id); continue;
            }
            if (before.EndsAt <= earliest || row.State == ScheduleState.Planned && row.StartsAt < anchor) { Warn("UndoHistoryPreserved", row); continue; }
            var start = before.StartsAt > earliest ? before.StartsAt : earliest;
            if (before.TaskId is { } taskId)
            {
                var task = tasks[taskId];
                if (!task.HasDirectWork || task.DirectWorkCompleted || task.IsArchived || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused))
                { Warn("UndoTaskInactive", before, WorkTime.Seconds(start, before.EndsAt)); continue; }
                if (task.EstimatedSeconds is null) { Warn("UndoEstimateUnknown", before, WorkTime.Seconds(start, before.EndsAt)); continue; }
                if (!source.WorkingWindows.Any(x => x.StartsAt <= start && x.EndsAt >= before.EndsAt)) { Warn("UndoOutsideWorkingHours", before, WorkTime.Seconds(start, before.EndsAt)); continue; }
            }
            proposed[row.Id] = before.Block() with { StartsAt = start, IsPreserved = false }; candidates.Add(row.Id);
            if (start > before.StartsAt) Warn("UndoElapsedPartNotRestored", before, WorkTime.Seconds(before.StartsAt, start));
        }
        // Bir adımı geri almak yeni çakışma çıkarabilir. Her turda en az bir aday elenir
        bool changed;
        do
        {
            changed = false;
            foreach (var id in candidates.Order().ToArray())
            {
                if (!proposed.TryGetValue(id, out var block)) continue; // Öğeyi kaldırmak tek başına yeni bir kısıt ihlali yaratmaz.
                if (block.EndsAt <= anchor) continue;
                string? issue = null;
                if (proposed.Any(pair => pair.Key != id && Overlaps(block, pair.Value)) || active.Any(a => a.ExistingScheduleId != id && Overlaps(block, a))) issue = "UndoOverlap";
                if ((source.ExternalBusyWindows ?? []).Any(x => x.StartsAt < block.EndsAt && block.StartsAt < x.EndsAt)) issue = "UndoExternalOverlap";
                if (issue is null && block.TaskId is { } taskId)
                {
                    var task = tasks[taskId]; var total = FutureSeconds(proposed.Values.Where(x => x.TaskId == taskId), anchor);
                    var old = FutureSeconds(current.Values.Where(x => x.TaskId == taskId), anchor);
                    var remaining = Math.Max(0, (task.EstimatedSeconds ?? 0) - task.ActualSeconds - task.OutsideReservedSeconds);
                    if (total > Math.Max(old, remaining)) issue = "UndoQuantityExceeded";
                    if (task.DeadlineAt is { } deadline && block.EndsAt > deadline) issue = "UndoDeadlineConflict";
                    if (!task.CanSplit && proposed.Values.Count(x => x.TaskId == taskId && x.EndsAt > anchor) > Math.Max(1, current.Values.Count(x => x.TaskId == taskId && x.EndsAt > anchor))) issue = "UndoNonSplitConflict";
                    if (source.Policy is { TransitionSeconds: > 0 } policy && proposed.Values.Concat(source.ExternalWorkBlocks ?? []).Any(x => x.TaskId.HasValue && x.TaskId != taskId && x.Kind == ScheduleKind.Work
                        && (x.EndsAt <= block.StartsAt && block.StartsAt - x.EndsAt < TimeSpan.FromSeconds(policy.TransitionSeconds)
                            || block.EndsAt <= x.StartsAt && x.StartsAt - block.EndsAt < TimeSpan.FromSeconds(policy.TransitionSeconds)))) issue = "UndoTransitionConflict";
                }
                if (issue is null) continue;
                if (current.TryGetValue(id, out var original)) proposed[id] = original; else proposed.Remove(id);
                candidates.Remove(id); Warn(issue, originals[id]); changed = true;
            }
        } while (changed);
        // Tahmini bitişte normal motorun önkoşul ve zorunlu çocuk grafiğini kullan.
        do
        {
            changed = false;
            var completion = ProjectedCompletions(source, proposed.Values, anchor);
            foreach (var id in candidates.Order().ToArray())
            {
                if (!proposed.TryGetValue(id, out var block) || block.TaskId is not { } taskId || block.EndsAt <= anchor) continue;
                var blocked = source.Dependencies.Any(d => d.SuccessorId == taskId && (!completion.TryGetValue(d.PredecessorId, out var end) || end > block.StartsAt));
                // Üst görevden gelen önkoşullar bu işten de önce bitmeli.
                var parent = tasks[taskId].ParentTaskId;
                while (!blocked && parent is { } parentId)
                {
                    blocked = source.Dependencies.Any(d => d.SuccessorId == parentId && (!completion.TryGetValue(d.PredecessorId, out var end) || end > block.StartsAt));
                    parent = tasks[parentId].ParentTaskId;
                }
                if (!blocked) continue;
                if (current.TryGetValue(id, out var original)) proposed[id] = original; else proposed.Remove(id);
                candidates.Remove(id); Warn("UndoDependencyConflict", originals[id]); changed = true;
            }
        } while (changed);
        // Bağımlılığı geri alınca eski dolu saat dönebilir. Çakışan geri alma adımını da çıkar
        do
        {
            changed = false;
            foreach (var id in candidates.Order().ToArray())
            {
                if (!proposed.TryGetValue(id, out var block) || block.EndsAt <= anchor) continue;
                if (!proposed.Any(pair => pair.Key != id && Overlaps(block, pair.Value))) continue;
                if (current.TryGetValue(id, out var original)) proposed[id] = original; else proposed.Remove(id);
                candidates.Remove(id); Warn("UndoOverlap", originals[id]); changed = true;
            }
        } while (changed);
        // Önkoşulu kaldırmak veya geciktirmek, dokunmadığımız sonraki işi bozmamalı.
        // Geri alma geçersizse uygulamadan çıkmak daha güvenli.
        var previousViolations = DependencyViolations(source, current.Values, anchor);
        if (DependencyViolations(source, proposed.Values, anchor).Except(previousViolations).Any())
        {
            foreach (var id in candidates.Order()) Warn("UndoDependencyConflict", originals[id]);
            proposed = current; candidates.Clear();
        }
        foreach (var id in candidates.Order()) explanations.Add(new("UndoFutureCompensation", originals[id].TaskId, ScheduleId: id));
        return new(source.LocalDate, source.PlanningVersion, anchor, "undo-v1", proposed.Values.OrderBy(x => x.StartsAt).ThenBy(x => x.ExistingScheduleId).ToImmutableArray(), [],
            warnings.OrderBy(x => x.Code, StringComparer.Ordinal).ThenBy(x => x.TaskId).ToImmutableArray(), explanations.ToImmutableArray(), false);
    }
    private static decimal FutureSeconds(IEnumerable<SchedulingBlock> blocks, DateTimeOffset now) => blocks.Where(x => x.EndsAt > now).Sum(x => WorkTime.Seconds(x.StartsAt > now ? x.StartsAt : now, x.EndsAt));
    private static bool Overlaps(SchedulingBlock a, SchedulingBlock b) => a.StartsAt < b.EndsAt && b.StartsAt < a.EndsAt;
    private static HashSet<Guid> DependencyViolations(SchedulingSnapshot source, IEnumerable<SchedulingBlock> blocks, DateTimeOffset anchor)
    {
        var array = blocks.ToArray(); var completion = ProjectedCompletions(source, array, anchor); var tasks = source.Tasks.ToDictionary(x => x.Id); var bad = new HashSet<Guid>();
        foreach (var block in array.Where(x => x.TaskId.HasValue && x.EndsAt > anchor))
        {
            Guid? taskId = block.TaskId;
            while (taskId is { } id)
            {
                if (source.Dependencies.Any(d => d.SuccessorId == id && (!completion.TryGetValue(d.PredecessorId, out var end) || end > block.StartsAt))) { bad.Add(block.ExistingScheduleId!.Value); break; }
                taskId = tasks[id].ParentTaskId;
            }
        }
        return bad;
    }
    public static bool IntroducesDependencyViolation(SchedulingSnapshot source, IEnumerable<SchedulingBlock> before, IEnumerable<SchedulingBlock> after) =>
        DependencyViolations(source, after, source.ServerNow).Except(DependencyViolations(source, before, source.ServerNow)).Any();
    private static Dictionary<Guid, DateTimeOffset> ProjectedCompletions(SchedulingSnapshot source, IEnumerable<SchedulingBlock> blocks, DateTimeOffset anchor)
    {
        var tasks = source.Tasks.ToArray(); var placed = blocks.Where(x => x.TaskId.HasValue && x.Kind == ScheduleKind.Work && x.EndsAt > anchor).ToLookup(x => x.TaskId!.Value);
        var ready = new bool[tasks.Length]; var covered = new DateTimeOffset[tasks.Length];
        for (var i = 0; i < tasks.Length; i++)
        {
            var t = tasks[i]; var parts = placed[t.Id].ToArray();
            ready[i] = !t.HasDirectWork || t.DirectWorkCompleted || t.State == TaskState.Completed || t.EstimatedSeconds is { } estimate && t.ActualSeconds + t.OutsideReservedSeconds + FutureSeconds(parts, anchor) >= estimate && estimate > t.ActualSeconds;
            covered[i] = parts.Select(x => x.EndsAt).Append(t.OutsideCompletionAt ?? anchor).Max();
            if (t.OutsideReservedSeconds > 0 && t.OutsideCompletionAt is null) ready[i] = false;
        }
        var projection = new SchedulingProjection(tasks, source.Dependencies.ToArray(), anchor, ready, covered);
        var result = new Dictionary<Guid, DateTimeOffset>();
        foreach (var task in tasks) if (projection.Completion(task.Id) is { } completion) result[task.Id] = completion;
        return result;
    }
}
