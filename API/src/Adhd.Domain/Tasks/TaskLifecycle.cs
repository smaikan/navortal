namespace Adhd.Domain.Tasks;

public enum TaskAction { Complete, Reopen, Defer, Skip, Cancel, CompleteDirectWork, ReopenDirectWork }
public enum ParentCompletionChoice { CompleteSubtree, ParentOnly, Cancel }

public static class TaskLifecycle
{
    public static void Apply(IReadOnlyCollection<TaskItem> nodes, Guid id, TaskAction action, ParentCompletionChoice? choice, DateTimeOffset now)
    {
        var index = nodes.ToDictionary(x => x.Id); var selected = index[id];
        var children = nodes.Where(x => x.ArchivedAt is null && x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        if (action == TaskAction.Complete)
        {
            if (choice == ParentCompletionChoice.Cancel) return;
            if (children[id].Any() && choice is null) throw new ArgumentException("Parent completion choice required.", nameof(choice));
            var queue = new Queue<TaskItem>(); queue.Enqueue(selected);
            while (queue.TryDequeue(out var task))
            {
                task.DirectWorkCompleted = task.HasDirectWork;
                Complete(task, CompletionOrigin.Manual, now);
                if (choice == ParentCompletionChoice.CompleteSubtree) foreach (var child in children[task.Id]) queue.Enqueue(child);
            }
            Reconcile(nodes, AncestorSeed(selected), now); return;
        }
        if (action is TaskAction.CompleteDirectWork or TaskAction.ReopenDirectWork)
        {
            if (!selected.HasDirectWork) throw new ArgumentException("Container has no direct work.", nameof(action));
            selected.DirectWorkCompleted = action == TaskAction.CompleteDirectWork;
            if (action == TaskAction.ReopenDirectWork) Open(selected);
            Reconcile(nodes, action == TaskAction.CompleteDirectWork ? [id] : AncestorSeed(selected), now);
            return;
        }
        selected.DirectWorkCompleted = false;
        selected.State = action switch
        {
            TaskAction.Reopen => TaskState.Pending, TaskAction.Defer => TaskState.Deferred,
            TaskAction.Skip => TaskState.Skipped, TaskAction.Cancel => TaskState.Canceled,
            _ => throw new ArgumentOutOfRangeException(nameof(action))
        };
        selected.CompletedAt = null; selected.CompletionOrigin = null;
        Reconcile(nodes, AncestorSeed(selected), now);
    }
    public static void Reconcile(IReadOnlyCollection<TaskItem> nodes, IEnumerable<Guid> starts, DateTimeOffset now)
    {
        var index = nodes.ToDictionary(x => x.Id);
        var children = nodes.Where(x => x.ArchivedAt is null && x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var affected = new HashSet<Guid>();
        foreach (var seed in starts)
        {
            Guid? current = seed;
            while (current is { } id && index.TryGetValue(id, out var task) && affected.Add(id)) current = task.ParentTaskId;
        }
        var pending = affected.ToDictionary(x => x, x => children[x].Count(c => affected.Contains(c.Id)));
        var ready = new Queue<Guid>(pending.Where(x => x.Value == 0).Select(x => x.Key));
        while (ready.TryDequeue(out var id))
        {
            var task = index[id]; var descendants = children[id].ToArray();
            var eligible = (task.HasDirectWork || descendants.Length > 0) && (!task.HasDirectWork || task.DirectWorkCompleted)
                && descendants.Where(x => x.RequiredForParent).All(x => x.State == TaskState.Completed);
            if (task.ArchivedAt is null && task.AutoCompleteFromChildren && task.State is TaskState.Pending or TaskState.InProgress or TaskState.Paused && eligible)
                Complete(task, CompletionOrigin.Automatic, now);
            else if (task.State == TaskState.Completed && task.CompletionOrigin == CompletionOrigin.Automatic && !eligible) Open(task);
            if (task.ParentTaskId is { } parent && pending.ContainsKey(parent) && --pending[parent] == 0) ready.Enqueue(parent);
        }
    }
    private static Guid[] AncestorSeed(TaskItem task) => task.ParentTaskId is { } parent ? [parent] : [];
    private static void Complete(TaskItem task, CompletionOrigin origin, DateTimeOffset now)
    { task.State = TaskState.Completed; task.CompletionOrigin = origin; task.CompletedAt ??= now; }
    private static void Open(TaskItem task)
    { task.State = TaskState.Pending; task.CompletionOrigin = null; task.CompletedAt = null; }
}
