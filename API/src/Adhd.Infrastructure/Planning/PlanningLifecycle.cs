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
        var blocks = await db.TaskSchedules.Where(x => x.UserId == userId && x.TaskId.HasValue && ids.Contains(x.TaskId.Value) && x.State == ScheduleState.Planned && x.EndsAt > now).ToArrayAsync(ct);
        var changes = new List<PlanDelta>();
        foreach (var block in blocks)
        {
            var before = RevisionWriter.View(block);
            if (block.StartsAt >= now) block.State = ScheduleState.Removed; else block.EndsAt = now;
            block.Version++; changes.Add(new(block, before, block.State == ScheduleState.Removed ? "Removed" : "Shortened"));
        }
        _ = await RevisionWriter.Write(db, userId, changes, now, "TaskState", "Görev yaşam döngüsü değişikliği", Guid.CreateVersion7(), false, ct);
    }
}
