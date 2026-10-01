using Adhd.Application.Common;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

internal static class TaskGraphAccess
{
    internal static async Task Validate(PlannerDbContext db, Guid userId, IReadOnlyCollection<TaskItem> nodes, CancellationToken ct)
    {
        var persisted = await db.TaskDependencies.AsNoTracking().Where(x => x.UserId == userId).ToArrayAsync(ct);
        var changes = db.ChangeTracker.Entries<TaskDependency>().Where(x => x.Entity.UserId == userId).ToArray();
        var removed = changes.Where(x => x.State == EntityState.Deleted).Select(x => x.Entity.Id).ToHashSet();
        var edges = persisted.Where(x => !removed.Contains(x.Id)).Concat(changes.Where(x => x.State == EntityState.Added).Select(x => x.Entity)).DistinctBy(x => x.Id).ToArray();
        if (TaskGraphRules.HasCycle(nodes, edges)) throw new UseCaseException(ErrorKind.Validation, "dependency_cycle", "Görev ağacı ve ön koşullar birlikte döngü oluşturuyor.");
    }
}
