using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

internal static class PlanningLifecycle
{
    internal static async Task CloseFuture(PlannerDbContext db, Guid userId, IReadOnlyCollection<TaskItem> tasks, DateTimeOffset now, CancellationToken ct)
    {
        var ids = tasks.Where(x => x.ArchivedAt is not null || x.DirectWorkCompleted || x.State is TaskState.Completed or TaskState.Deferred or TaskState.Canceled or TaskState.Skipped).Select(x => x.Id).ToArray();
        var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned && x.CompletedAt == null && x.EndsAt > now).ToArrayAsync(ct);
        var changes = new List<PlanDelta>();
        // A plan completion can mark a tracked block before this transaction is saved.
        // The SQL predicate sees the previous DB value; honor the current tracked completion too.
        foreach (var block in blocks.Where(x => x.CompletedAt is null))
        {
            var before = RevisionWriter.View(block);
            if (block.StartsAt >= now) block.State = ScheduleState.Removed; else block.EndsAt = now;
            block.Version++; changes.Add(new(block, before, block.State == ScheduleState.Removed ? "Removed" : "Shortened"));
        }
        _ = await RevisionWriter.Write(db, userId, changes, now, "TaskState", "Görev yaşam döngüsü değişikliği", Guid.CreateVersion7(), false, ct);
    }
}
