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
        var previous = selected.State;
        selected.DirectWorkCompleted = false;
        selected.State = action switch
        {
            TaskAction.Reopen => TaskState.Pending, TaskAction.Defer => TaskState.Deferred,
            TaskAction.Skip => TaskState.Skipped, TaskAction.Cancel => TaskState.Canceled,
            _ => throw new ArgumentOutOfRangeException(nameof(action))
        };
        selected.CompletedAt = null; selected.CompletionOrigin = null;
        if (action == TaskAction.Reopen) { ReopenDescendants(selected, children); if (previous != TaskState.Pending) ReopenAncestors(selected, index); }
        Reconcile(nodes, AncestorSeed(selected), now);
    }
    /// <summary>Üst görev yeniden açılınca tamamlanmış alt görevleri de açılır; iptal, atlama ve erteleme durumları korunur.</summary>
    private static void ReopenDescendants(TaskItem root, ILookup<Guid, TaskItem> children)
    {
        var queue = new Queue<TaskItem>(children[root.Id]);
        while (queue.TryDequeue(out var task))
        {
            if (task.State == TaskState.Completed) { Open(task); task.DirectWorkCompleted = false; }
            foreach (var child in children[task.Id]) queue.Enqueue(child);
        }
    }
    /// <summary>Alt görev açılınca onu gerekli sayan tamamlanmış üst görevler, elle tamamlanmış olsa da açılır. Gerekli sayılmayan halkada zincir durur.</summary>
    private static void ReopenAncestors(TaskItem task, IReadOnlyDictionary<Guid, TaskItem> index)
    {
        var current = task;
        while (current.RequiredForParent && current.ParentTaskId is { } parentId && index.TryGetValue(parentId, out var parent))
        {
            if (parent.State == TaskState.Completed) Open(parent);
            current = parent;
        }
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
