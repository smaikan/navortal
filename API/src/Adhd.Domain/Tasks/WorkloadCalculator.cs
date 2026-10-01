namespace Adhd.Domain.Tasks;

public sealed record WorkloadSummary(Guid TaskId, long KnownEstimatedSeconds, int UnknownEstimateCount,
    long? CalculatedTotalSeconds, long? TargetBudgetSeconds, long? TargetDifferenceSeconds);
public sealed record WorkComponent(Guid TaskId, long? EstimatedSeconds);
public sealed record WorkloadResult(IReadOnlyDictionary<Guid, WorkloadSummary> Summaries, WorkComponent[] Components);

public static class WorkloadCalculator
{
    // Önce çocukları gez. Ağaç derinleştikçe çağrı yığını büyümesin diye döngü kullan
    public static WorkloadResult Calculate(IReadOnlyCollection<TaskItem> tasks)
    {
        var nodes = tasks.ToDictionary(x => x.Id);
        var pending = nodes.Keys.ToDictionary(id => id, _ => 0);
        var known = nodes.Values.ToDictionary(x => x.Id, x => x.HasDirectWork ? x.DirectEstimatedSeconds ?? 0 : 0);
        var unknown = nodes.Values.ToDictionary(x => x.Id, x => x.HasDirectWork && x.DirectEstimatedSeconds is null ? 1 : 0);
        foreach (var task in tasks)
        {
            if (task.DirectEstimatedSeconds < 0 || task.TargetBudgetSeconds < 0 || (!task.HasDirectWork && task.DirectEstimatedSeconds.HasValue))
                throw new ArgumentException("Invalid work definition.", nameof(tasks));
            if (task.ParentTaskId is { } parent && nodes.ContainsKey(parent)) pending[parent]++;
        }
        var ready = new Queue<Guid>(pending.Where(x => x.Value == 0).Select(x => x.Key));
        var summaries = new Dictionary<Guid, WorkloadSummary>();
        while (ready.TryDequeue(out var id))
        {
            var task = nodes[id]; var complete = unknown[id] == 0;
            summaries.Add(id, new(id, known[id], unknown[id], complete ? known[id] : null, task.TargetBudgetSeconds,
                complete && task.TargetBudgetSeconds.HasValue ? task.TargetBudgetSeconds.Value - known[id] : null));
            if (task.ParentTaskId is not { } parent || !nodes.ContainsKey(parent)) continue;
            known[parent] = checked(known[parent] + known[id]);
            unknown[parent] = checked(unknown[parent] + unknown[id]);
            if (--pending[parent] == 0) ready.Enqueue(parent);
        }
        if (summaries.Count != tasks.Count) throw new InvalidOperationException("Task tree contains a cycle.");
        var components = tasks.Where(x => x.HasDirectWork && !x.DirectWorkCompleted && x.ArchivedAt is null && x.State is TaskState.Pending or TaskState.InProgress or TaskState.Paused)
            .OrderBy(x => x.Id).Select(x => new WorkComponent(x.Id, x.DirectEstimatedSeconds)).ToArray();
        return new(summaries, components);
    }
}
