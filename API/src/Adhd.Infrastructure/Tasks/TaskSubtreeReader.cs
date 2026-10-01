using Adhd.Application.Common;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

internal static class TaskSubtreeReader
{
    internal static async Task<TaskItem[]> Read(PlannerDbContext db, Guid userId, Guid taskId, CancellationToken ct, bool tracking = false)
    {
        if (!await db.Tasks.AnyAsync(x => x.UserId == userId && x.Id == taskId, ct))
            throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        var query = db.Tasks.FromSqlInterpolated($"""
            WITH RECURSIVE tree AS (
                SELECT * FROM tasks WHERE "UserId" = {userId} AND "Id" = {taskId}
                UNION ALL
                SELECT t.* FROM tasks t JOIN tree p ON t."ParentTaskId" = p."Id" AND t."UserId" = p."UserId" WHERE t."ArchivedAt" IS NULL
            ) SELECT * FROM tree
            """);
        return tracking ? await query.AsTracking().ToArrayAsync(ct) : await query.AsNoTracking().ToArrayAsync(ct);
    }
}
