namespace Adhd.Domain.Tasks;

public sealed record PlannedRange(DateOnly From, DateOnly To);
// Açık çocuklardan herhangi birinde etkin gün aralığı varsa üst aralık çocukların ilk/son gününü kapsar, kendi aralığı yok sayılır.
// Yoksa görevin kendi aralığı, o da yoksa en yakın aralıklı üst görevin aralığı (kalıtım) kullanılır.
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
                    : Own(entry.Task) ?? InheritedFrom(entry.Task, tasks);
            }
        }
        return result;
    }

    private static PlannedRange? Own(TaskItem task) => task.PlannedFrom is { } from && task.PlannedTo is { } to ? new PlannedRange(from, to) : null;
    /// <summary>Görevin kendi aralığı yoksa en yakın aralıklı üst görevin kendi aralığı. Döngü olursa durur.</summary>
    private static PlannedRange? InheritedFrom(TaskItem task, IReadOnlyDictionary<Guid, TaskItem> tasks)
    {
        var seen = new HashSet<Guid> { task.Id };
        for (var parent = task.ParentTaskId; parent is { } id && tasks.TryGetValue(id, out var up) && seen.Add(id); parent = up.ParentTaskId)
            if (Own(up) is { } range) return range;
        return null;
    }
    /// <summary>Görevin kendi veya üstünden kalıtılan aralığı. Üst görevin altlardan türeyen aralığı değil, yalnız elle yazılan aralıklar sayılır.</summary>
    public static IReadOnlyDictionary<Guid, PlannedRange?> OwnOrInherited(IReadOnlyCollection<TaskItem> input)
    {
        var tasks = input.Where(x => x.ArchivedAt is null).ToDictionary(x => x.Id);
        return tasks.Values.ToDictionary(x => x.Id, x => Own(x) ?? InheritedFrom(x, tasks));
    }
    /// <summary>Aralık bitişi hatırlatmaları: bitişten bir önceki gün 18:00 ve bitiş günü 09:00 (kullanıcının saat diliminde).</summary>
    public static IReadOnlyList<DateTimeOffset> EndReminders(PlannedRange range, TimeZoneInfo zone)
    {
        DateTimeOffset At(DateOnly day, int hour) => new(TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(new TimeOnly(hour, 0)), zone), TimeSpan.Zero);
        return [At(range.To.AddDays(-1), 18), At(range.To, 9)];
    }
    /// <summary>Altlarından en az birinin (kendisi veya torunu) elle yazılmış aralığı olan görevler. Yalnız kalıtılan aralık "alt görevlerden türedi" sayılmaz.</summary>
    public static IReadOnlySet<Guid> DerivedFromChildren(IReadOnlyCollection<TaskItem> input)
    {
        var tasks = input.Where(x => x.ArchivedAt is null).ToDictionary(x => x.Id);
        var result = new HashSet<Guid>();
        foreach (var task in tasks.Values.Where(x => Own(x) is not null))
        {
            var seen = new HashSet<Guid> { task.Id };
            for (var parent = task.ParentTaskId; parent is { } id && tasks.TryGetValue(id, out var up) && seen.Add(id); parent = up.ParentTaskId) result.Add(id);
        }
        return result;
    }
}
