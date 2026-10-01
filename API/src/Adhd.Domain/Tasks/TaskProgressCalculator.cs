namespace Adhd.Domain.Tasks;

public sealed record TaskProgress(Guid TaskId, int TotalTaskCount, int CompletedTaskCount, int ComponentCount, int CompletedComponentCount,
    double? CountProgress, long KnownEstimatedSeconds, long KnownCompletedEstimatedSeconds, int UnknownEstimateCount, double? DurationProgress,
    int RequiredChildCount, int IncompleteRequiredChildCount, bool HasOpenChildren, bool HasOpenDescendants);

public static class TaskProgressCalculator
{
    public static TaskProgress Calculate(IReadOnlyCollection<TaskItem> subtree, Guid taskId)
    {
        var components = subtree.Where(x => x.HasDirectWork).ToArray();
        var completed = components.Where(x => x.DirectWorkCompleted).ToArray();
        var known = components.Aggregate(0L, (sum, x) => checked(sum + (x.DirectEstimatedSeconds ?? 0)));
        var completedKnown = completed.Aggregate(0L, (sum, x) => checked(sum + (x.DirectEstimatedSeconds ?? 0)));
        var unknown = components.Count(x => x.DirectEstimatedSeconds is null);
        var children = subtree.Where(x => x.ParentTaskId == taskId).ToArray();
        var required = children.Where(x => x.RequiredForParent).ToArray();
        return new(taskId, subtree.Count, subtree.Count(x => x.State == TaskState.Completed), components.Length, completed.Length,
            components.Length == 0 ? null : (double)completed.Length / components.Length,
            known, completedKnown, unknown, unknown == 0 && known > 0 ? (double)completedKnown / known : null,
            required.Length, required.Count(x => x.State != TaskState.Completed), children.Any(x => x.State != TaskState.Completed),
            subtree.Any(x => x.Id != taskId && x.State != TaskState.Completed));
    }
}
