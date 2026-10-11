using System.Text.Json;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<PlanMutationResult> ReturnManyToPoolAsync(Guid userId, DateOnly sourceDate, ReturnManyToPool command, string key, CancellationToken ct)
    {
        ValidateDate(sourceDate);
        command = command with { Tasks = command.Tasks.OrderBy(x => x.Id).ToArray(), Reason = Reason(command.Reason) };
        var payload = new { sourceDate, command };
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await Lock(userId, ct);
        var replay = await Replay(userId, "day-end-pool-batch", key, payload, ct);
        if (replay is not null) return new(replay, true);
        CheckVersion(state, command.ExpectedPlanningVersion);
        if (!await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == command.PoolId && x.ArchivedAt == null, ct))
            throw Missing("resource_not_found", "Havuz bulunamadı.");
        var ids = command.Tasks.Select(x => x.Id).ToArray();
        var tasks = await db.Tasks.Where(x => x.UserId == userId && ids.Contains(x.Id) && x.DeletedAt == null).ToArrayAsync(ct);
        if (tasks.Length != ids.Length) throw Missing("task_not_found", "Görev bulunamadı.");
        foreach (var task in tasks)
        {
            if (task.Version != command.Tasks.Single(x => x.Id == task.Id).Version) throw Conflict("version_conflict", "Görev değişmiş; güncel kaydı alın.");
            if (task.ArchivedAt is not null || task.State is TaskState.Completed or TaskState.Canceled or TaskState.Skipped)
                throw Conflict("task_not_open", "Yalnız açık işi havuzda bekletebilirsiniz.");
        }
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && x.State == WorkState.Running, ct))
            throw Conflict("work_running", "Aktif işi havuzda bekletmeden önce duraklatın.");
        var now = clock.GetUtcNow();
        var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && x.Kind == ScheduleKind.Work && x.State == ScheduleState.Planned && x.CompletedAt == null && x.EndsAt > now).ToArrayAsync(ct);
        if (!command.AllowProtectedChange && blocks.Any(x => x.IsFixed || x.IsLocked)) throw Conflict("schedule_protected", "Sabit veya kilitli tahsisi kaldırma niyetini açık belirtin.");
        var items = await db.DayItems.Where(x => x.UserId == userId && x.LocalDate == sourceDate && ids.Contains(x.TaskId) && x.State == DayItemState.Planned && x.CompletedAt == null).ToArrayAsync(ct);
        var changeSet = Guid.CreateVersion7();
        var affected = tasks.Where(t => t.PoolId != command.PoolId || blocks.Any(x => x.TaskId == t.Id) || items.Any(x => x.TaskId == t.Id)).ToArray();
        var deltas = new List<PlanDelta>();
        foreach (var block in blocks)
        {
            var before = RevisionWriter.View(block);
            if (block.StartsAt >= now) block.State = ScheduleState.Removed; else block.EndsAt = now;
            block.Version++;
            deltas.Add(new(block, before, block.State == ScheduleState.Removed ? "Removed" : "Shortened"));
        }
        var dayDeltas = new List<DayDelta>();
        var source = affected.Length > 0 ? await Plan(userId, sourceDate, null, ct) : null;
        foreach (var item in items)
        {
            var before = RevisionWriter.Snapshot(item);
            item.State = DayItemState.Removed; item.Version++; item.UpdatedAt = now;
            dayDeltas.Add(new(item, before, "DayItemReturnedToPool", source!.Id));
        }
        foreach (var task in affected)
        {
            var before = TaskStore.View(task);
            task.PoolId = command.PoolId; task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "ReturnedToPoolBatch", before, new { changeSetId = changeSet, sourceDate });
        }
        var revisions = await RevisionWriter.Write(db, userId, deltas, now, "Pool", command.Reason!, changeSet, false, ct, dayDeltas: dayDeltas, touchedPlanIds: source is null ? [] : [source.Id]);
        if (affected.Length > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = new PlanMutation(changeSet, state.PlanningVersion, deltas.Select(x => RevisionWriter.View(x.Schedule)).ToArray(), revisions, []);
        Remember(userId, "day-end-pool-batch", key, payload, result, now);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(result, false);
    }

    // Çağıranın plan kilidi ve işlemiyle devam et. Geri alma eski kaydı ezmek yerine yeni revizyon yazar.
    private async Task<DayItemBatchResult> UndoPoolBatch(Guid userId, Guid original, UserPlanningState state, PlanRevision[] revisions, PlanRevisionChange[] changes, CancellationToken ct)
    {
        var events = await db.TaskEvents.FromSqlInterpolated($"SELECT * FROM task_events WHERE \"UserId\"={userId} AND \"Type\"='ReturnedToPoolBatch' AND \"Payload\"->'data'->>'changeSetId'={original.ToString()}").AsNoTracking().Take(51).ToArrayAsync(ct);
        if (events.Length is < 1 or > 50) throw Conflict("undo_pool_snapshot_invalid", "Havuz değişikliğinin kaydı okunamadı.");
        var now = clock.GetUtcNow(); var next = Guid.CreateVersion7();
        var deltas = new List<PlanDelta>(); var dayDeltas = new List<DayDelta>(); var restored = new List<DayItem>();
        foreach (var e in events)
        {
            TaskView before, after;
            try
            {
                using var payload = JsonDocument.Parse(e.Payload);
                before = PoolSnapshot<TaskView>(payload.RootElement.GetProperty("before").GetRawText());
                after = PoolSnapshot<TaskView>(payload.RootElement.GetProperty("after").GetRawText());
            }
            catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException)
            { throw Conflict("undo_pool_snapshot_invalid", "Havuz değişikliğinin kaydı okunamadı."); }
            var task = await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == e.TaskId, ct);
            if (before.Id != task.Id || after.Id != task.Id) throw Conflict("undo_pool_snapshot_invalid", "Havuz değişikliğinin görev kimliği uyuşmuyor.");
            if (task.Version != after.Version || task.PoolId != after.PoolId || task.ArchivedAt is not null || task.DeletedAt is not null || task.State is TaskState.Completed or TaskState.Canceled or TaskState.Skipped)
                throw Conflict("undo_pool_task_changed", "Görev bu işlemden sonra değişmiş; güncel kaydı alın.");
            if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == task.Id && x.State == WorkState.Running, ct))
                throw Conflict("work_running", "Çalışan işin planı geri alınamaz; önce açıkça duraklatın.");
            if (before.PoolId is { } oldPool && !await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == oldPool && x.ArchivedAt == null, ct))
                throw Conflict("undo_pool_target_changed", "Önceki havuz artık kullanılamıyor; güncel görevden havuz seçin.");
            var current = TaskStore.View(task); task.PoolId = before.PoolId; task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "PoolReturnUndone", current, new { changeSetId = next, reversesChangeSetId = original });
        }
        foreach (var change in changes)
        {
            if (change.ScheduleId is { } scheduleId)
            {
                var before = PoolSnapshot<ScheduleView>(change.Before);
                var after = PoolSnapshot<ScheduleView>(change.After);
                var block = await db.TaskSchedules.SingleAsync(x => x.UserId == userId && x.Id == scheduleId, ct);
                if (block.Version != after.Version || block.State != after.State) throw Conflict("undo_pool_schedule_changed", "Saatli öğe değişmiş; güncel planı alın.");
                if (before.StartsAt < now) throw Conflict("undo_pool_time_passed", "Bu saatli öğenin zamanı başlamış; geçmiş plan geri yazılamaz.");
                var current = RevisionWriter.View(block);
                block.State = before.State; block.StartsAt = before.StartsAt; block.EndsAt = before.EndsAt; block.Version++;
                deltas.Add(new(block, current, "PoolReturnUndone"));
            }
            else if (change.DayItemId is { } itemId)
            {
                var before = PoolSnapshot<DayItemSnapshot>(change.Before);
                var after = PoolSnapshot<DayItemSnapshot>(change.After);
                var item = await db.DayItems.SingleAsync(x => x.UserId == userId && x.Id == itemId, ct);
                if (item.Version != after.Version || item.State != after.State) throw Conflict("undo_day_item_changed", "Saatsiz öğe değişmiş; güncel planı alın.");
                if (await db.DayItems.AnyAsync(x => x.UserId == userId && x.Id != item.Id && x.TaskId == item.TaskId && x.LocalDate == before.LocalDate && x.State == DayItemState.Planned, ct)) throw Conflict("day_item_exists", "Görev o günün planında zaten var.");
                var current = RevisionWriter.Snapshot(item);
                item.State = before.State; item.CompletedAt = before.CompletedAt; item.Version++; item.UpdatedAt = now;
                dayDeltas.Add(new(item, current, "DayItemUndone", revisions.Single(x => x.Id == change.RevisionId).DailyPlanId));
                restored.Add(item);
            }
        }
        await RevisionWriter.Write(db, userId, deltas, now, "Pool", "Havuz işlemi geri alındı", next, false, ct, reversesChangeSetId: original, dayDeltas: dayDeltas, touchedPlanIds: revisions.Select(x => x.DailyPlanId).ToArray());
        state.PlanningVersion++; state.UpdatedAt = now; await db.SaveChangesAsync(ct);
        var views = new List<DayItemView>();
        foreach (var item in restored) views.Add(await Read(userId, item.Id, ct));
        return new(next, state.PlanningVersion, views.ToArray());
    }
    private static T PoolSnapshot<T>(string? json) where T : class
    {
        try { return json is null ? throw new JsonException() : JsonSerializer.Deserialize<T>(json, RevisionWriter.Json) ?? throw new JsonException(); }
        catch (JsonException) { throw Conflict("undo_pool_snapshot_invalid", "Havuz değişikliğinin kaydı okunamadı."); }
    }
}
