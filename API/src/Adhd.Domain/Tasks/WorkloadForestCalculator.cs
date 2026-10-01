namespace Adhd.Domain.Tasks;

public sealed record WorkloadForestSummary(int TaskCount, int DirectComponentCount, int OpenComponentCount, long KnownEstimatedSeconds, int UnknownEstimateCount, long? CalculatedTotalSeconds);
public static class WorkloadForestCalculator
{
    public static WorkloadForestSummary Calculate(IEnumerable<TaskItem> input)
    {
        var tasks = input.Where(x => x.ArchivedAt is null).DistinctBy(x => x.Id).ToArray();
        var ids = tasks.Select(x => x.Id).ToHashSet(); var result = WorkloadCalculator.Calculate(tasks);
        var roots = tasks.Where(x => x.ParentTaskId is not { } parent || !ids.Contains(parent)).Select(x => result.Summaries[x.Id]).ToArray();
        var known = roots.Aggregate(0L, (sum, x) => checked(sum + x.KnownEstimatedSeconds));
        var unknown = roots.Aggregate(0, (sum, x) => checked(sum + x.UnknownEstimateCount));
        return new(tasks.Length, tasks.Count(x => x.HasDirectWork), result.Components.Length, known, unknown, unknown == 0 ? known : null);
    }
}
