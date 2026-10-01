using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<PlanMutationResult> ReturnToPoolAsync(Guid userId, DateOnly sourceDate, Guid taskId, ReturnToPool command, string key, CancellationToken ct)
    {
        ValidateDate(sourceDate); command = command with { Reason = Reason(command.Reason) }; var payload = new { sourceDate, taskId, command };
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "day-end-pool", key, payload, ct); if (replay is not null) return new(replay, true);
        CheckVersion(state, command.ExpectedPlanningVersion);
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct) ?? throw Missing("task_not_found", "Görev bulunamadı.");
        if (task.Version != command.Version) throw Conflict("version_conflict", "Görev değişmiş; güncel kaydı alın.");
        if (task.ArchivedAt is not null || task.State is TaskState.Completed or TaskState.Canceled or TaskState.Skipped)
            throw Conflict("task_not_open", "Yalnız açık işi havuzda bekletebilirsiniz.");
        if (!await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == command.PoolId, ct)) throw Missing("resource_not_found", "Havuz bulunamadı.");
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == taskId && x.State == WorkState.Running, ct))
            throw Conflict("work_running", "Aktif işi havuzda bekletmeden önce duraklatın.");
        var now = clock.GetUtcNow(); var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId == taskId && x.Kind == ScheduleKind.Work && x.State == ScheduleState.Planned && x.EndsAt > now).ToArrayAsync(ct);
        if (!command.AllowProtectedChange && blocks.Any(x => x.IsFixed || x.IsLocked)) throw Conflict("schedule_protected", "Sabit/kilitli tahsisleri kaldırma niyetini açık belirtin.");
        var deltas = new List<PlanDelta>();
        foreach (var block in blocks)
        {
            var before = RevisionWriter.View(block);
            if (block.StartsAt >= now) block.State = ScheduleState.Removed; else block.EndsAt = now;
            block.Version++; deltas.Add(new(block, before, block.State == ScheduleState.Removed ? "Removed" : "Shortened"));
        }
        var changed = task.PoolId != command.PoolId;
        if (changed)
        {
            var before = TaskStore.View(task); var oldPool = task.PoolId; task.PoolId = command.PoolId; task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, "ReturnedToPool", before, new { sourceDate, oldPoolId = oldPool, poolId = command.PoolId, reason = command.Reason });
        }
        var changeSet = Guid.CreateVersion7();
        var revisions = await RevisionWriter.Write(db, userId, deltas, now, "DayEnd", command.Reason!, changeSet, false, ct);
        if (changed || deltas.Count > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = new PlanMutation(changeSet, state.PlanningVersion, deltas.Select(x => RevisionWriter.View(x.Schedule)).ToArray(), revisions, []);
        Remember(userId, "day-end-pool", key, payload, result, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);
    }
}
