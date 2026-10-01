using System.Collections.Immutable;

namespace Adhd.Domain.Scheduling;

public static class SchedulingSelection
{
    public static HashSet<Guid> Expand(IEnumerable<SchedulingTask> source, ImmutableArray<Guid> roots)
    {
        var tasks = source.ToArray(); var ids = tasks.Select(x => x.Id).ToHashSet();
        if (roots.Any(x => !ids.Contains(x))) throw new ArgumentException("Unknown selected task.");
        var children = tasks.Where(x => x.ParentTaskId.HasValue && !x.IsArchived).ToLookup(x => x.ParentTaskId!.Value);
        var queue = new Queue<Guid>(roots); var selected = new HashSet<Guid>();
        while (queue.TryDequeue(out var id)) if (selected.Add(id)) foreach (var child in children[id]) queue.Enqueue(child.Id);
        return selected;
    }
}
