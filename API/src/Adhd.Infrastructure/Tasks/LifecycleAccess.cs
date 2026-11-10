using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;

namespace Adhd.Infrastructure.Tasks;

internal static class LifecycleAccess
{
    internal static Dictionary<Guid, TaskView> Capture(IReadOnlyCollection<TaskItem> nodes) => nodes.ToDictionary(x => x.Id, TaskStore.View);
    internal static int Record(PlannerDbContext db, IReadOnlyCollection<TaskItem> nodes, Dictionary<Guid, TaskView> before, DateTimeOffset now, string kind, object? data = null, Func<TaskItem, object?>? dataForTask = null)
    {
        var changed = nodes.Where(x => TaskStore.View(x) != before[x.Id]).ToArray();
        foreach (var task in changed)
        {
            task.Version++; task.UpdatedAt = now;
            TaskHistory.Append(db, task, kind, before[task.Id], dataForTask is null ? data : dataForTask(task));
        }
        return changed.Length;
    }
    internal static void Reconcile(PlannerDbContext db, IReadOnlyCollection<TaskItem> nodes, IEnumerable<Guid> starts, DateTimeOffset now)
    {
        var before = Capture(nodes); TaskLifecycle.Reconcile(nodes, starts, now);
        _ = Record(db, nodes, before, now, "AutomaticCompletionReconciled");
    }
}
