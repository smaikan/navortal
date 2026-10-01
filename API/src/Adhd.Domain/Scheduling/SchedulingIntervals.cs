using Adhd.Domain.Work;

namespace Adhd.Domain.Scheduling;

internal static class SchedulingIntervals
{
    internal static SchedulingWindow[] Union(IEnumerable<SchedulingWindow> source)
    {
        var result = new List<SchedulingWindow>();
        foreach (var item in source.Where(x => x.StartsAt < x.EndsAt).OrderBy(x => x.StartsAt).ThenBy(x => x.EndsAt))
        {
            if (result.Count == 0 || item.StartsAt > result[^1].EndsAt) result.Add(item);
            else if (item.EndsAt > result[^1].EndsAt) result[^1] = result[^1] with { EndsAt = item.EndsAt };
        }
        return result.ToArray();
    }
    internal static SchedulingWindow[] Free(IEnumerable<SchedulingWindow> working, IEnumerable<SchedulingWindow> occupied)
    {
        var used = Union(occupied); var result = new List<SchedulingWindow>();
        foreach (var window in Union(working))
        {
            var cursor = window.StartsAt;
            foreach (var block in used)
            {
                if (block.EndsAt <= cursor) continue;
                if (block.StartsAt >= window.EndsAt) break;
                if (block.StartsAt > cursor) result.Add(new(cursor, block.StartsAt));
                if (block.EndsAt > cursor) cursor = block.EndsAt;
                if (cursor >= window.EndsAt) break;
            }
            if (cursor < window.EndsAt) result.Add(new(cursor, window.EndsAt));
        }
        return result.ToArray();
    }
    internal static SchedulingWindow? Find(IEnumerable<SchedulingWindow> free, DateTimeOffset earliest, DateTimeOffset? deadline, decimal seconds)
    {
        foreach (var gap in free)
        {
            var start = gap.StartsAt > earliest ? gap.StartsAt : earliest;
            var end = deadline is { } due && due < gap.EndsAt ? due : gap.EndsAt;
            if (end > start && WorkTime.Seconds(start, end) >= seconds)
                return new(start, start.AddTicks(checked((long)(seconds * TimeSpan.TicksPerSecond))));
        }
        return null;
    }
}
