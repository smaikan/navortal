using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    private sealed record RemovedPlanGroup(Guid ChangeSetId, PlanDelta[] Schedules);

    // Use the hierarchy saved in this day's plan, not a task tree that may have changed later.
    private async Task<RemovedPlanGroup?> RemovePlanGroup(Guid userId, UserPlanningState state, DateOnly date,
        Guid taskId, bool allowProtectedChange, DateTimeOffset now, CancellationToken ct)
    {
        var members = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date && x.GroupTaskId != null
            && (x.State == DayItemState.Planned || x.State == DayItemState.Scheduled
                && db.TaskSchedules.Any(b => b.UserId == userId && b.Id == x.ScheduleId && b.State == ScheduleState.Planned))).ToArrayAsync(ct);
        var groupId = members.FirstOrDefault(x => x.TaskId == taskId)?.GroupTaskId;
        if (groupId is null) return null;

        var children = members.Where(x => x.GroupTaskId == groupId && x.GroupParentTaskId != null)
            .DistinctBy(x => x.TaskId).ToLookup(x => x.GroupParentTaskId!.Value);
        if (!children[taskId].Any()) return null;
        var taskIds = new HashSet<Guid>();
        var queue = new Queue<Guid>([taskId]);
        while (queue.TryDequeue(out var id))
        {
            if (!taskIds.Add(id)) continue;
            foreach (var child in children[id]) queue.Enqueue(child.TaskId);
        }

        var plan = await Plan(userId, date, null, ct);
        var items = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date && taskIds.Contains(x.TaskId)
            && (x.State == DayItemState.Planned || x.State == DayItemState.Scheduled
                && db.TaskSchedules.Any(b => b.UserId == userId && b.Id == x.ScheduleId && b.State == ScheduleState.Planned))).ToArrayAsync(ct);
        var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && x.DailyPlanId == plan.Id
            && x.TaskId != null && taskIds.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned).ToArrayAsync(ct);
        if (!allowProtectedChange && blocks.Any(x => x.IsFixed || x.IsLocked))
            throw Conflict("schedule_protected", "Grubun sabit veya kilitli saatli öğesini önce açıkça serbest bırakın.");

        var days = new List<DayDelta>();
        foreach (var item in items)
        {
            var before = RevisionWriter.Snapshot(item);
            item.State = DayItemState.Removed; item.Version++; item.UpdatedAt = now;
            days.Add(new(item, before, "DayItemRemoved", plan.Id));
        }
        var schedules = new List<PlanDelta>();
        foreach (var block in blocks)
        {
            var before = RevisionWriter.View(block);
            block.State = ScheduleState.Removed; block.Version++;
            schedules.Add(new(block, before, "Removed"));
        }
        var changeSet = await History(userId, state, days, now, "Görev grubu plandan kaldırıldı", null, ct,
            "DayGroup", schedules);
        return new(changeSet, schedules.ToArray());
    }

    private async Task<DayItemBatchResult> UndoPlanGroup(Guid userId, Guid original, UserPlanningState state,
        PlanRevision[] revisions, PlanRevisionChange[] changes, CancellationToken ct)
    {
        if (revisions.Any(x => x.ReversesChangeSetId != null))
            throw Conflict("undo_source_invalid", "Geri alınmış grup kaldırma işlemi tekrar geri alınamaz.");
        var now = clock.GetUtcNow();
        var schedules = new List<PlanDelta>();
        foreach (var change in changes.Where(x => x.ScheduleId != null))
        {
            var before = JsonSerializer.Deserialize<ScheduleView>(change.Before!, RevisionWriter.Json)!;
            var after = JsonSerializer.Deserialize<ScheduleView>(change.After!, RevisionWriter.Json)!;
            var block = await db.TaskSchedules.SingleAsync(x => x.UserId == userId && x.Id == change.ScheduleId, ct);
            if (block.Version != after.Version || block.State != after.State || block.CompletedAt != after.CompletedAt)
                throw Conflict("undo_day_item_changed", "Grubun saatli öğesi değişmiş; güncel planı alın.");
            var current = RevisionWriter.View(block);
            block.State = before.State; block.Version++;
            schedules.Add(new(block, current, "Restored"));
        }
        var days = new List<DayDelta>();
        var restored = new List<DayItem>();
        foreach (var change in changes.Where(x => x.DayItemId != null))
        {
            var before = JsonSerializer.Deserialize<DayItemSnapshot>(change.Before!, RevisionWriter.Json)!;
            var after = JsonSerializer.Deserialize<DayItemSnapshot>(change.After!, RevisionWriter.Json)!;
            var item = await db.DayItems.SingleAsync(x => x.UserId == userId && x.Id == change.DayItemId, ct);
            if (item.Version != after.Version || item.State != after.State || item.LocalDate != after.LocalDate)
                throw Conflict("undo_day_item_changed", "Grubun gün öğesi değişmiş; güncel planı alın.");
            if (before.State == DayItemState.Planned && await db.DayItems.AnyAsync(x => x.UserId == userId
                && x.Id != item.Id && x.LocalDate == before.LocalDate && x.TaskId == item.TaskId && x.State == DayItemState.Planned, ct))
                throw Conflict("day_item_exists", "Görev bu günün planına yeniden eklenmiş; güncel planı alın.");
            var current = RevisionWriter.Snapshot(item);
            item.State = before.State; item.Version++; item.UpdatedAt = now;
            days.Add(new(item, current, "DayItemUndone", revisions.Single(x => x.Id == change.RevisionId).DailyPlanId));
            restored.Add(item);
        }
        var changeSet = await History(userId, state, days, now, "Görev grubu geri alındı", original, ct,
            "DayGroup", schedules);
        var views = new List<DayItemView>();
        foreach (var item in restored) views.Add(View(item, await TaskOf(userId, item.TaskId, ct)));
        return new(changeSet, state.PlanningVersion, views.ToArray());
    }
}
