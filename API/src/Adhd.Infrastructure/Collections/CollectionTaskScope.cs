using Adhd.Application.Common;
using Adhd.Domain.Tasks;

namespace Adhd.Infrastructure.Collections;

// Liste, ağaç ve iş yükü aynı üyelik kuralını kullanır. Açıkça kaldırılan bir dal
// üst görevin üyeliğini tekrar devralmaz; başka bölüme bağlı görevler de taşınmaz.
internal static class CollectionTaskScope
{
    internal static Guid? Direct(TaskItem task, string kind) => kind switch
    {
        "projects" => task.ProjectId, "pools" => task.PoolId, "categories" => task.CategoryId,
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };
    private static bool Detached(TaskItem task, string kind) => kind switch
    {
        "projects" => task.ProjectDetached, "pools" => task.PoolDetached, "categories" => task.CategoryDetached,
        _ => throw new ArgumentOutOfRangeException(nameof(kind))
    };
    internal static void Detach(TaskItem task, string kind, bool blockInheritance)
    {
        switch (kind)
        {
            case "projects": task.ProjectId = null; task.ProjectDetached |= blockInheritance; break;
            case "pools": task.PoolId = null; task.PoolDetached |= blockInheritance; break;
            case "categories": task.CategoryId = null; task.CategoryDetached |= blockInheritance; break;
            default: throw new ArgumentOutOfRangeException(nameof(kind));
        }
    }
    internal static Dictionary<Guid, Guid?> Resolve(TaskItem[] tasks, string kind)
    {
        var byId = tasks.ToDictionary(x => x.Id); var result = new Dictionary<Guid, Guid?>();
        foreach (var task in tasks)
        {
            var path = new List<Guid>(); var seen = new HashSet<Guid>(); var current = task;
            Guid? owner;
            while (true)
            {
                if (result.TryGetValue(current.Id, out owner)) break;
                if (!seen.Add(current.Id)) throw new UseCaseException(ErrorKind.Conflict, "task_tree_cycle", "Görev ağacında döngü var.");
                path.Add(current.Id); owner = Direct(current, kind);
                if (owner.HasValue || Detached(current, kind) || current.ParentTaskId is not {} parent || !byId.TryGetValue(parent, out current!)) break;
            }
            foreach (var id in path) result[id] = owner;
        }
        return result;
    }
}
