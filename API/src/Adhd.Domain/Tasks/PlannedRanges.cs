namespace Adhd.Domain.Tasks;

public sealed record PlannedRange(DateOnly From, DateOnly To);
// Açık çocuklardan herhangi birinde etkin gün aralığı varsa üst aralık çocukların ilk/son gününü kapsar, kendi aralığı yok sayılır. Yoksa görevin kendi aralığı kullanılır.
public static class PlannedRanges
{
    public static IReadOnlyDictionary<Guid, PlannedRange?> Effective(IReadOnlyCollection<TaskItem> input)
    {
        var tasks = input.Where(x => x.ArchivedAt is null).ToDictionary(x => x.Id);
        var children = tasks.Values.Where(x => x.ParentTaskId is { } p && tasks.ContainsKey(p)).ToLookup(x => x.ParentTaskId!.Value);
        var result = new Dictionary<Guid, PlannedRange?>();
        // Derin ağaçta çağrı yığını dolmasın diye çocuklardan yukarı döngüyle çık.
        foreach (var root in tasks.Values.Where(x => x.ParentTaskId is not { } p || !tasks.ContainsKey(p)))
        {
            var stack = new Stack<(TaskItem Task, bool Expanded)>(); stack.Push((root, false));
            while (stack.TryPop(out var entry))
            {
                if (!entry.Expanded) { stack.Push((entry.Task, true)); foreach (var child in children[entry.Task.Id]) stack.Push((child, false)); continue; }
                var ranges = children[entry.Task.Id].Select(x => result[x.Id]).OfType<PlannedRange>().ToArray();
                result[entry.Task.Id] = ranges.Length > 0 ? new PlannedRange(ranges.Min(x => x.From), ranges.Max(x => x.To))
                    : entry.Task.PlannedFrom is { } from && entry.Task.PlannedTo is { } to ? new PlannedRange(from, to) : null;
            }
        }
        return result;
    }
}
