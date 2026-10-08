using Adhd.Application.Common;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

internal static class WorkLifecycle
{
    internal static async Task<int> CloseForTasks(PlannerDbContext db, Guid userId, IReadOnlyCollection<TaskItem> nodes, DateTimeOffset now, CancellationToken ct)
    {
        var closing = nodes.Where(x => x.ArchivedAt is not null || x.DirectWorkCompleted || x.State is TaskState.Completed or TaskState.Deferred or TaskState.Canceled or TaskState.Skipped).ToDictionary(x => x.Id);
        var ids = closing.Keys.ToArray();
        var sessions = await db.WorkSessions.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && (x.State == WorkState.Running || x.State == WorkState.Paused)).ToArrayAsync(ct);
        if (sessions.Length == 0) return 0;
        var sessionIds = sessions.Select(x => x.Id).ToArray();
        var segments = await db.WorkSegments.Where(x => x.UserId == userId && sessionIds.Contains(x.SessionId)).ToArrayAsync(ct);
        if (sessions.Any(x => now < x.StartedAt) || segments.Any(x => now < (x.EndedAt ?? x.StartedAt)))
            throw new UseCaseException(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanÄ± Ã¶nceki kayÄ±ttan geride; tekrar deneyin.");
        foreach (var segment in segments.Where(x => !x.IsVoided && x.EndedAt is null)) { segment.EndedAt = now; segment.Version++; }
        foreach (var session in sessions)
        {
            session.State = WorkState.Finished; session.EndedAt = now; session.Version++;
            var task = closing[session.TaskId!.Value]; if (task.State == TaskState.InProgress) task.State = TaskState.Paused;
            await Adhd.Infrastructure.Focus.FocusLifecycle.SyncWork(db, session, segments.Where(x => x.SessionId == session.Id), now, ct);
        }
        return sessions.Length;
    }
}
