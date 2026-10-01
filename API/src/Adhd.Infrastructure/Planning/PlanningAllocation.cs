using System.Data;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

public sealed partial class PlanningStore
{
    public async Task<TaskAllocation> AllocationAsync(Guid userId, Guid taskId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
    {
        from = from.ToUniversalTime(); to = to.ToUniversalTime();
        if (from >= to || to - from > TimeSpan.FromDays(366)) throw Invalid("range_invalid", "Pozitif, en çok366 günlük tarih aralığı gerekli.");
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var task = await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct) ?? throw Missing("task_not_found", "Görev bulunamadı.");
        var now = clock.GetUtcNow(); var cutoff = from > now ? from : now;
        var blocks = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.TaskId == taskId && x.State == ScheduleState.Planned && x.StartsAt < to && x.EndsAt > cutoff).ToArrayAsync(ct);
        var allocated = to <= cutoff ? 0 : blocks.Sum(x => WorkTime.Seconds(x.StartsAt > cutoff ? x.StartsAt : cutoff, x.EndsAt < to ? x.EndsAt : to));
        var actual = await Actual(userId, taskId, now, ct); var remaining = Remaining(task, actual);
        return new(taskId, from, to, cutoff, actual, allocated, remaining, remaining is { } r ? Math.Max(0, r - allocated) : null, remaining is { } e ? Math.Max(0, allocated - e) : null);
    }
    private async Task<PlanningWarning[]> QuantityWarnings(Guid userId, Guid? taskId, DateTimeOffset now, CancellationToken ct)
    {
        if (taskId is null) return [];
        var task = await db.Tasks.AsNoTracking().SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
        var blocks = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && x.TaskId == taskId && x.State == ScheduleState.Planned && x.EndsAt > now).ToArrayAsync(ct);
        var ids = blocks.Select(x => x.Id).ToArray(); var result = new List<PlanningWarning>();
        if (task.DeadlineAt is { } deadline && blocks.Any(x => x.EndsAt > deadline)) result.Add(new("deadline_risk", ids));
        var remaining = Remaining(task, await Actual(userId, task.Id, now, ct));
        if (remaining is null) result.Add(new("estimate_unknown", ids));
        else
        {
            var allocated = blocks.Sum(x => WorkTime.Seconds(x.StartsAt > now ? x.StartsAt : now, x.EndsAt)); var difference = remaining.Value - allocated;
            if (difference > 0) result.Add(new("allocation_incomplete", ids, difference)); else if (difference < 0) result.Add(new("allocation_exceeds_remaining", ids, -difference));
        }
        return result.ToArray();
    }
    private async Task<decimal> Actual(Guid userId, Guid taskId, DateTimeOffset now, CancellationToken ct)
    {
        var segments = await (from segment in db.WorkSegments.AsNoTracking() join session in db.WorkSessions.AsNoTracking() on segment.SessionId equals session.Id
                              where session.UserId == userId && segment.UserId == userId && session.TaskId == taskId select segment).ToArrayAsync(ct);
        if (segments.Any(x => !x.IsVoided && (x.EndedAt ?? x.StartedAt) > now)) throw Conflict("server_clock_conflict", "Sunucu zamanı önceki kayıttan geride.");
        return WorkTime.Seconds(segments, now);
    }
    private static decimal? Remaining(TaskItem task, decimal actual) => !task.HasDirectWork || task.DirectWorkCompleted || task.ArchivedAt is not null || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused) ? 0
        : task.DirectEstimatedSeconds is { } estimate ? Math.Max(0, estimate - actual) : null;
}
