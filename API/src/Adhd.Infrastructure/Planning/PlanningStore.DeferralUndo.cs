using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    // Ertelemeyi olduğu gibi geri al. Yeni saat ayırma, eski plan ve gerçek çalışma aynı kalsın.
    private async Task<DayItemBatchResult> UndoDeferral(Guid userId, Guid original, UserPlanningState state, PlanRevision[] revisions, PlanRevisionChange[] changes, CancellationToken ct)
    {
        if (revisions.Any(x => x.ReversesChangeSetId.HasValue)) throw Conflict("undo_source_invalid", "Geri alınmış erteleme tekrar geri alınamaz.");
        var now = clock.GetUtcNow(); var next = Guid.CreateVersion7(); var deltas = new List<PlanDelta>(); var days = new List<DayDelta>(); var restored = new List<DayItem>();
        var taskIds = new HashSet<Guid>();
        foreach (var change in changes.Where(x => x.ScheduleId.HasValue))
        {
            var before = DeferralSnapshot<ScheduleView>(change.Before); var after = DeferralSnapshot<ScheduleView>(change.After);
            var block = await db.TaskSchedules.SingleAsync(x => x.UserId == userId && x.Id == change.ScheduleId, ct);
            if (block.Version != after.Version || block.State != ScheduleState.Removed || block.CompletedAt != after.CompletedAt)
                throw Conflict("undo_defer_schedule_changed", "Saatli öğe ertelemeden sonra değişmiş; güncel planı alın.");
            if (before.TaskId is { } taskId) taskIds.Add(taskId);
            var current = RevisionWriter.View(block); block.State = before.State; block.Version++;
            deltas.Add(new(block, current, "Restored"));
        }
        foreach (var group in changes.Where(x => x.DayItemId.HasValue).GroupBy(x => x.DayItemId!.Value))
        {
            var entries = group.ToArray();
            var last = entries.SingleOrDefault(x => x.Type == "DayItemMovedIn") ?? entries.Single();
            var after = DeferralSnapshot<DayItemSnapshot>(last.After);
            var first = entries.SingleOrDefault(x => x.Before is not null);
            var before = first is null ? null : DeferralSnapshot<DayItemSnapshot>(first.Before);
            var item = await db.DayItems.SingleAsync(x => x.UserId == userId && x.Id == group.Key, ct);
            if (item.Version != after.Version || item.State != after.State || item.LocalDate != after.LocalDate)
                throw Conflict("undo_day_item_changed", "Saatsiz öğe ertelemeden sonra değişmiş; güncel planı alın.");
            taskIds.Add(item.TaskId); var current = RevisionWriter.Snapshot(item); var from = await Plan(userId, item.LocalDate, null, ct);
            if (before is null) item.State = DayItemState.Removed;
            else
            {
                if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.Id != item.Id && x.TaskId == item.TaskId && x.LocalDate == before.LocalDate && x.State == DayItemState.Planned, ct))
                    throw Conflict("day_item_exists", "Görev kaynak günün planına yeniden eklenmiş; önce güncel planı kontrol edin.");
                item.LocalDate = before.LocalDate; item.SortOrder = before.SortOrder; item.State = before.State; item.CompletedAt = before.CompletedAt; item.ScheduleId = before.TimedScheduleId; item.StartsAt=before.StartsAt; item.EndsAt=before.EndsAt; item.IsUrgent=before.IsUrgent; item.TimingIssue=before.TimingIssue;
            }
            item.Version++; item.UpdatedAt = now;
            if (item.LocalDate != current.LocalDate)
            {
                var target = await Plan(userId, item.LocalDate, null, ct);
                days.Add(new(item, current, "DayItemMovedOut", from.Id, current with { State = DayItemState.Removed, Version = item.Version }));
                days.Add(new(item, null, "DayItemMovedIn", target.Id));
            }
            else days.Add(new(item, current, "DayItemUndone", from.Id));
            if (item.State == DayItemState.Planned) restored.Add(item);
        }
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId.HasValue && taskIds.Contains(x.TaskId.Value) && x.State == WorkState.Running, ct))
            throw Conflict("work_running", "Çalışan işi önce açıkça duraklat; ertelemenin geri alınması çalışmayı durdurmaz.");
        var tasks = await db.Tasks.Where(x => x.UserId == userId && taskIds.Contains(x.Id)).ToArrayAsync(ct);
        if (tasks.Length != taskIds.Count || tasks.Any(x => x.DeletedAt is not null)) throw Conflict("undo_defer_task_changed", "Görev ertelemeden sonra değişmiş; güncel kaydı alın.");
        foreach (var task in tasks) Plannable(task);
        await RevisionWriter.Write(db, userId, deltas, now, "Defer", "Erteleme geri alındı", next, false, ct, "defer-undo-v1", original, days);
        state.PlanningVersion++; state.UpdatedAt = now; await db.SaveChangesAsync(ct);
        var views = new List<DayItemView>(); foreach (var item in restored) views.Add(await Read(userId, item.Id, ct));
        return new(next, state.PlanningVersion, views.ToArray());
    }
    private static T DeferralSnapshot<T>(string? value) where T : class => value is null
        ? throw Conflict("undo_snapshot_invalid", "Ertelemenin kayıtlı plan görüntüsü okunamadı.")
        : JsonSerializer.Deserialize<T>(value, RevisionWriter.Json) ?? throw Conflict("undo_snapshot_invalid", "Ertelemenin kayıtlı plan görüntüsü okunamadı.");
}
