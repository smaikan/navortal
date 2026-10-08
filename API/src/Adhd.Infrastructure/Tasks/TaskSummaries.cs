using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

// Hesabın açık ağacını bir kez gez. Çocuk sayısını, bilinen tahmini ve etkin gün aralığını al.
internal static class TaskSummaries
{
    internal static async Task<TreeRowSummary[]> Build(PlannerDbContext db, Guid userId, Guid[] ids, CancellationToken ct)
    {
        if (ids.Length == 0) return [];
        var counts = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null && x.ParentTaskId != null && ids.Contains(x.ParentTaskId.Value))
            .GroupBy(x => x.ParentTaskId!.Value).Select(g => new { Id = g.Key, Total = g.Count(), Done = g.Count(x => x.State == TaskState.Completed) }).ToDictionaryAsync(x => x.Id, ct);
        var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        IReadOnlyDictionary<Guid, WorkloadSummary>? workload;
        try { workload = WorkloadCalculator.Calculate(tasks).Summaries; }
        catch (OverflowException) { workload = null; }
        var ranges = PlannedRanges.Effective(tasks); var children = tasks.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        return ids.Select(id =>
        {
            counts.TryGetValue(id, out var count); WorkloadSummary? sum = null; _ = workload?.TryGetValue(id, out sum);
            ranges.TryGetValue(id, out var range);
            var derived = children[id].Any(c => ranges.TryGetValue(c.Id, out var r) && r is not null);
            return new TreeRowSummary(id, count?.Total ?? 0, count?.Done ?? 0, sum?.KnownEstimatedSeconds, sum?.UnknownEstimateCount ?? 0, range?.From, range?.To, derived);
        }).ToArray();
    }
}
