using System.Data;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public async Task<WorkView> GetAsync(Guid userId, Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var session = await Find(userId, id, ct); var now = clock.GetUtcNow();
        return View(session, Measured(await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == id).ToArrayAsync(ct), now), now);
    }
    public async Task<CurrentWork> CurrentAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var session = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        var now = clock.GetUtcNow();
        var segments = session is null ? [] : await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == session.Id).ToArrayAsync(ct);
        return new(session is null ? null : View(session, Measured(segments, now), now), now, version);
    }
    public async Task<WorkPage> ListAsync(Guid userId, int offset, int limit, WorkState? state, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var query = db.WorkSessions.AsNoTracking().Where(x => x.UserId == userId && (state == null || x.State == state));
        var total = await query.CountAsync(ct);
        var sessions = await query.OrderByDescending(x => x.StartedAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        var ids = sessions.Select(x => x.Id).ToArray();
        var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.SessionId)).ToArrayAsync(ct);
        var grouped = segments.ToLookup(x => x.SessionId); var now = clock.GetUtcNow();
        return new(sessions.Select(s => View(s, Measured(grouped[s.Id], now), now)).ToArray(), offset, limit, total);
    }
    public async Task<SegmentPage> SegmentsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); _ = await Find(userId, id, ct);
        var query = db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == id);
        var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.StartedAt).ThenBy(x => x.Id).Skip(offset).Take(limit).Select(x => new SegmentView(x.Id, x.StartedAt, x.EndedAt, x.IsVoided, x.Version)).ToArrayAsync(ct);
        return new(rows, offset, limit, total);
    }
    public async Task<TaskTimeView> TaskTimeAsync(Guid userId, Guid taskId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        _ = await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct)
            ?? throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        // Arşivleyince geçmiş çalışma kaybolmaz. Bugünkü ağaç ile başlarken kaydettiğimiz yol ayrı.
        var tasks = await db.Tasks.FromSqlInterpolated($"""
            WITH RECURSIVE tree AS (
                SELECT * FROM tasks WHERE "UserId" = {userId} AND "Id" = {taskId}
                UNION ALL SELECT t.* FROM tasks t JOIN tree p ON t."ParentTaskId" = p."Id" AND t."UserId" = p."UserId"
            ) SELECT * FROM tree
            """).AsNoTracking().ToArrayAsync(ct);
        var ids = tasks.Select(x => x.Id).ToArray();
        var segments = await (from segment in db.WorkSegments.AsNoTracking()
                              join session in db.WorkSessions.AsNoTracking() on new { segment.UserId, Id = segment.SessionId } equals new { session.UserId, session.Id }
                              where session.UserId == userId && session.TaskId.HasValue && ids.Contains(session.TaskId.Value) && !segment.IsVoided
                              select new { TaskId = session.TaskId!.Value, Segment = segment }).ToArrayAsync(ct);
        var now = clock.GetUtcNow(); var grouped = segments.ToLookup(x => x.TaskId, x => x.Segment);
        decimal total = 0, direct = 0, remaining = 0, overtime = 0; var unknown = 0; var unknownRemaining = 0;
        foreach (var task in tasks)
        {
            var actual = Measured(grouped[task.Id], now); total += actual; if (task.Id == taskId) direct = actual;
            if (!task.HasDirectWork) continue;
            if (task.DirectEstimatedSeconds is { } estimate) overtime += Math.Max(0, actual - estimate); else unknown++;
            if (task.ArchivedAt is not null || task.DirectWorkCompleted || task.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused)) continue;
            if (task.DirectEstimatedSeconds is { } known) remaining += Math.Max(0, known - actual); else unknownRemaining++;
        }
        return new(taskId, direct, total, remaining, unknownRemaining, unknownRemaining == 0 ? remaining : null, overtime, unknown, now);
    }
}
