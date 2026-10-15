using Adhd.Domain.Tasks;

namespace Adhd.Domain.Scheduling;

internal sealed class SchedulingProjection
{
    private readonly SchedulingTask[] tasks;
    private readonly TaskMarkers graph;
    private readonly DateTimeOffset[] earliest;
    private readonly bool[] fired;
    private readonly bool[] ownReady;
    private readonly DateTimeOffset[] ownEnd;
    private readonly Queue<int> pending = new();
    internal SchedulingProjection(SchedulingTask[] source, SchedulingDependency[] dependencies, DateTimeOffset anchor, bool[] ready, DateTimeOffset[] ends)
    {
        tasks = source; ownReady = ready; ownEnd = ends;
        var nodes = source.Select(x => new TaskItem { Id = x.Id, ParentTaskId = x.ParentTaskId, RequiredForParent = x.RequiredForParent, ArchivedAt = x.IsArchived ? anchor : null }).ToArray();
        var edges = dependencies.Select(x => new TaskDependency { PredecessorTaskId = x.PredecessorId, SuccessorTaskId = x.SuccessorId }).ToArray();
        if (TaskGraphRules.HasCycle(nodes, edges)) throw new ArgumentException("Scheduling task/dependency graph contains a cycle.", nameof(dependencies));
        graph = TaskGraphRules.BuildMarkers(nodes, edges); earliest = Enumerable.Repeat(anchor, source.Length * 2).ToArray(); fired = new bool[earliest.Length];
        // Üst görev elle bitirildiyse açık çocukları olsa bile kayıtlı Completed geçerli.
        for (var i = 0; i < tasks.Length; i++) if (tasks[i].State == TaskState.Completed) Fire(i * 2 + 1, anchor);
        for (var i = 0; i < earliest.Length; i++) if (graph.Degree[i] == 0) pending.Enqueue(i);
        Drain();
    }
    internal bool Started(int index) => fired[index * 2];
    internal DateTimeOffset StartReadyAt(int index) => earliest[index * 2];
    internal DateTimeOffset? Completion(Guid id) => graph.Indices.TryGetValue(id, out var index) && fired[index * 2 + 1] ? earliest[index * 2 + 1] : null;
    internal void CompleteOwn(int index, DateTimeOffset at)
    {
        ownReady[index] = true; ownEnd[index] = at;
        if (graph.Degree[index * 2 + 1] == 0) pending.Enqueue(index * 2 + 1); Drain();
    }
    internal DateTimeOffset?[] LatestCompletions(IEnumerable<(Guid TaskId, DateTimeOffset StartsAt)> reservations)
    {
        var reverse = Enumerable.Range(0, fired.Length).Select(_ => new List<int>()).ToArray();
        for (var i = 0; i < graph.Adjacency.Length; i++) foreach (var to in graph.Adjacency[i]) reverse[to].Add(i);
        var limits = new DateTimeOffset?[fired.Length]; var queue = new Queue<int>();
        for (var i = 0; i < tasks.Length; i++) if (tasks[i].DeadlineAt is { } deadline) { limits[i * 2 + 1] = deadline; queue.Enqueue(i * 2 + 1); }
        foreach (var reservation in reservations)
        {
            var vertex = graph.Indices[reservation.TaskId] * 2;
            if (limits[vertex] is null || reservation.StartsAt < limits[vertex]) { limits[vertex] = reservation.StartsAt; queue.Enqueue(vertex); }
        }
        while (queue.TryDequeue(out var vertex))
        {
            if ((vertex & 1) == 1 && tasks[vertex / 2].State == TaskState.Completed) continue;
            foreach (var from in reverse[vertex])
                if (limits[from] is null || limits[vertex] < limits[from]) { limits[from] = limits[vertex]; queue.Enqueue(from); }
        }
        return Enumerable.Range(0, tasks.Length).Select(i => limits[i * 2 + 1]).ToArray();
    }
    private void Drain()
    {
        while (pending.TryDequeue(out var vertex))
        {
            if (fired[vertex] || graph.Degree[vertex] != 0) continue;
            if ((vertex & 1) == 0) Fire(vertex, earliest[vertex]);
            else
            {
                var i = vertex / 2;
                if (ownReady[i] && !tasks[i].IsArchived && tasks[i].State is TaskState.Pending or TaskState.InProgress or TaskState.Paused)
                    Fire(vertex, ownEnd[i] > earliest[vertex] ? ownEnd[i] : earliest[vertex]);
            }
        }
    }
    private void Fire(int vertex, DateTimeOffset at)
    {
        if (fired[vertex]) return; fired[vertex] = true; earliest[vertex] = at;
        foreach (var next in graph.Adjacency[vertex])
        {
            if (fired[next]) continue;
            if (at > earliest[next]) earliest[next] = at;
            if (--graph.Degree[next] == 0) pending.Enqueue(next);
        }
    }
}
