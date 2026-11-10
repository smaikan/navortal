using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    private async Task<PlanEntryResult> AddGroup(Guid userId, DateOnly date, AddPlanEntry command, TaskItem root, Adhd.Domain.Users.UserPlanningState state, string key, string hash, DateTimeOffset now, CancellationToken ct)
    {
        if (command.IsUrgent) throw Invalid("group_urgent_invalid", "Ana görevi önce normal plana ekleyin; saatini sonra düzenleyebilirsiniz.");
        var all = await db.Tasks.Where(x => x.UserId == userId && x.DeletedAt == null && x.ArchivedAt == null).Take(50001).ToArrayAsync(ct);
        if (all.Length > 50000) throw Conflict("task_tree_too_dense", "Görev ağacı çok büyük.");
        var children = all.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var nodes = new List<TaskItem>(); var seen = new HashSet<Guid>(); var queue = new Queue<TaskItem>([root]);
        while (queue.TryDequeue(out var task)) {
            if (!seen.Add(task.Id)) throw Conflict("task_tree_cycle", "Görev ağacında döngü var.");
            if (task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused or TaskState.Completed)) continue;
            nodes.Add(task); if (nodes.Count > 2000) throw Conflict("task_group_too_large", "Bir ana görev grubu en çok 2000 görev içerebilir."); foreach (var child in children[task.Id]) queue.Enqueue(child);
        }
        var ids = nodes.Select(x => x.Id).ToArray();
        if (await db.RecurrenceOccurrences.AnyAsync(x => x.UserId == userId && x.TaskId != null && ids.Contains(x.TaskId.Value) && x.LocalDate != date, ct)) throw Conflict("recurrence_day_mismatch", "Rutin görevi kendi gününe eklenebilir.");
        var plan = await Plan(userId, date, null, ct);
        var existing = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date && ids.Contains(x.TaskId) && (x.State == DayItemState.Planned || x.State == DayItemState.Scheduled && db.TaskSchedules.Any(b => b.UserId == userId && b.Id == x.ScheduleId && b.State == ScheduleState.Planned))).ToArrayAsync(ct);
        var schedules = await db.TaskSchedules.Where(x => x.UserId == userId && x.DailyPlanId == plan.Id && x.TaskId != null && ids.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned).ToArrayAsync(ct);
        var order = (await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == date).MaxAsync(x => (int?)x.SortOrder, ct) ?? -1) + 1;
        var deltas = new List<DayDelta>(); DayItem? rootItem = null;
        // A larger root may already contain this root. Repeated selection retains that grouping.
        var outer = existing.FirstOrDefault(x => x.TaskId == root.Id)?.GroupTaskId;
        var groupId = outer ?? root.Id;
        foreach (var task in nodes) {
            var items = existing.Where(x => x.TaskId == task.Id).ToArray();
            if (items.Length == 0) {
                var schedule = schedules.FirstOrDefault(x => x.TaskId == task.Id);
                var item = new DayItem { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = date, TaskId = task.Id, SortOrder = order++, CreatedAt = now, UpdatedAt = now,
                    GroupTaskId = groupId, GroupParentTaskId = task.Id == groupId ? null : task.ParentTaskId, CompletedAt = task.State == TaskState.Completed ? task.CompletedAt ?? now : null,
                    State = schedule is null ? DayItemState.Planned : DayItemState.Scheduled, ScheduleId = schedule?.Id };
                db.DayItems.Add(item); deltas.Add(new(item, null, "DayItemAdded", plan.Id));
                if (task.Id == root.Id) rootItem = item;
            } else foreach (var item in items) {
                if (task.Id == root.Id) rootItem = item;
                if (item.GroupTaskId == groupId) continue;
                var before = RevisionWriter.Snapshot(item); item.GroupTaskId = groupId; item.GroupParentTaskId = task.Id == groupId ? null : task.ParentTaskId; item.Version++; item.UpdatedAt = now;
                deltas.Add(new(item, before, "DayItemGrouped", plan.Id));
            }
        }
        var change = deltas.Count == 0 ? (Guid?)null : await History(userId, state, deltas, now, "Ana görev alt görevleriyle plana eklendi", null, ct);
        var view = View(rootItem!, (root, all.FirstOrDefault(x => x.Id == root.ParentTaskId))) with { ChangeSetId = change, PlanningVersion = state.PlanningVersion };
        var result = new PlanEntryResult(view);
        db.IdempotencyRecords.Add(new() {UserId=userId, Scope="plan-entry-add", Key=key, RequestHash=hash, Response=JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt=now});
        await db.SaveChangesAsync(ct); return result;
    }
    private async Task MarkCurrentPlanBlocks(Guid userId, Guid taskId, DateOnly date, DateTimeOffset now, CancellationToken ct)
    {
        var all = await db.Tasks.Where(x => x.UserId == userId && x.DeletedAt == null && x.ArchivedAt == null).ToArrayAsync(ct);
        var children = all.Where(x=>x.ParentTaskId!=null).ToLookup(x=>x.ParentTaskId!.Value);
        var ids = new HashSet<Guid>(); var queue = new Queue<Guid>([taskId]);
        while(queue.TryDequeue(out var id)) { if(!ids.Add(id)) throw Conflict("task_tree_cycle","Görev ağacında döngü var."); foreach(var child in children[id])queue.Enqueue(child.Id); }
        var blocks = await (from b in db.TaskSchedules join p in db.DailyPlans on new {b.UserId, Id=b.DailyPlanId} equals new {p.UserId,p.Id}
            where b.UserId==userId && p.LocalDate==date && b.TaskId!=null && ids.Contains(b.TaskId.Value) && b.State==ScheduleState.Planned && b.CompletedAt==null select b).ToArrayAsync(ct);
        foreach(var block in blocks){block.CompletedAt=now;block.Version++;}
    }

}
