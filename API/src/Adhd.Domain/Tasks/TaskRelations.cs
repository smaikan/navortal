namespace Adhd.Domain.Tasks;

public sealed class TaskDependency
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid PredecessorTaskId { get; set; }
    public Guid SuccessorTaskId { get; set; }
}
public sealed class TaskOrderingPreference
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid BeforeTaskId { get; set; }
    public Guid AfterTaskId { get; set; }
}
public sealed record TaskStartDecision(Guid TaskId, bool CanStart, string[] Reasons, Guid[] BlockingPredecessorIds);

public static class TaskGraphRules
{
    // Her görevin başlangıç ve bitiş işareti var. Üst görev çocuğundan önce başlar,
    // zorunlu çocuk da üst görevden önce biter. Böylece bağlantı sayısı karesel büyümez
    public static bool HasCycle(IReadOnlyCollection<TaskItem> tasks, IReadOnlyCollection<TaskDependency> dependencies)
    {
        var graph = BuildMarkers(tasks, dependencies); var degree = graph.Degree;
        var queue = new Queue<int>(Enumerable.Range(0, degree.Length).Where(x => degree[x] == 0)); var processed = 0;
        while (queue.TryDequeue(out var node)) { processed++; foreach (var next in graph.Adjacency[node]) if (--degree[next] == 0) queue.Enqueue(next); }
        return processed != degree.Length;
    }
    internal static TaskMarkers BuildMarkers(IReadOnlyCollection<TaskItem> tasks, IReadOnlyCollection<TaskDependency> dependencies)
    {
        var ids = tasks.Select((task, i) => (task.Id, Index: i)).ToDictionary(x => x.Id, x => x.Index);
        var adjacency = Enumerable.Range(0, tasks.Count * 2).Select(_ => new HashSet<int>()).ToArray();
        var degree = new int[adjacency.Length];
        void Edge(int from, int to) { if (adjacency[from].Add(to)) degree[to]++; }
        foreach (var task in tasks)
        {
            var start = ids[task.Id] * 2; var end = start + 1; Edge(start, end);
            if (task.ArchivedAt is not null || task.ParentTaskId is not { } parent || !ids.TryGetValue(parent, out var p)) continue;
            Edge(p * 2, start);
            if (task.RequiredForParent) Edge(end, p * 2 + 1);
        }
        foreach (var dependency in dependencies) Edge(ids[dependency.PredecessorTaskId] * 2 + 1, ids[dependency.SuccessorTaskId] * 2);
        return new(ids, adjacency, degree);
    }
    public static TaskStartDecision CanStart(TaskItem selected, IReadOnlyCollection<TaskItem> tasks, IReadOnlyCollection<TaskDependency> dependencies)
    {
        var nodes = tasks.ToDictionary(x => x.Id); var ancestors = new HashSet<Guid>(); Guid? current = selected.Id;
        while (current is { } id && ancestors.Add(id) && nodes.TryGetValue(id, out var task)) current = task.ParentTaskId;
        var blocked = dependencies.Where(x => ancestors.Contains(x.SuccessorTaskId) && nodes[x.PredecessorTaskId].State != TaskState.Completed)
            .Select(x => x.PredecessorTaskId).Distinct().Order().ToArray();
        var reasons = new List<string>();
        if (selected.ArchivedAt is not null) reasons.Add("task_archived");
        if (!selected.HasDirectWork) reasons.Add("direct_work_required");
        if (selected.DirectWorkCompleted) reasons.Add("direct_work_completed");
        if (selected.State is not (TaskState.Pending or TaskState.InProgress or TaskState.Paused)) reasons.Add("task_inactive");
        if (blocked.Length > 0) reasons.Add("predecessor_incomplete");
        return new(selected.Id, reasons.Count == 0, reasons.ToArray(), blocked);
    }
}
internal sealed record TaskMarkers(Dictionary<Guid, int> Indices, HashSet<int>[] Adjacency, int[] Degree);
