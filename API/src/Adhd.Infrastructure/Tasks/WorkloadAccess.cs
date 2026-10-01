using Adhd.Application.Common;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

internal static class WorkloadAccess
{
    internal static WorkloadResult Calculate(IReadOnlyCollection<TaskItem> tasks)
    {
        try { return WorkloadCalculator.Calculate(tasks); }
        catch (OverflowException) { throw new UseCaseException(ErrorKind.Validation, "workload_overflow", "Toplam süre desteklenen sayı aralığını aşıyor."); }
    }
    internal static async Task<TaskItem[]> ValidateUserTree(PlannerDbContext db, Guid userId, CancellationToken ct)
    {
        // EF izlenen nesnenin güncel halini verir. Yeni çocuk henüz SQL'den gelmez.
        var persisted = await db.Tasks.Where(x => x.UserId == userId).ToArrayAsync(ct);
        var added = db.ChangeTracker.Entries<TaskItem>().Where(x => x.State == EntityState.Added && x.Entity.UserId == userId).Select(x => x.Entity);
        var nodes = persisted.Concat(added).DistinctBy(x => x.Id).ToArray();
        _ = Calculate(nodes); return nodes;
    }
}
