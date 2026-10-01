namespace Adhd.Domain.Planning;

public sealed record CalendarDateWindow(DateOnly LocalDate, string TimeZoneId, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public static class CalendarTime
{
    public static CalendarDateWindow[] Windows(DateOnly from, DateOnly to, IEnumerable<string> zones)
    {
        if (from.Year is < 2 or > 9998 || to.Year is < 2 or > 9998 || to.DayNumber - from.DayNumber is < 0 or > 41) throw new ArgumentOutOfRangeException(nameof(to));
        var result = new List<CalendarDateWindow>();
        foreach (var zone in zones.Distinct().Order(StringComparer.Ordinal))
            for (var date = from; date <= to; date = date.AddDays(1))
            {
                var start = PlanTime.DayStart(date, zone); var end = PlanTime.DayStart(date.AddDays(1), zone);
                if (end > start) result.Add(new(date, zone, start, end));
            }
        return result.ToArray();
    }
    public static decimal IntersectSeconds(DateTimeOffset startedAt, DateTimeOffset endedAt, CalendarDateWindow window)
    {
        if (endedAt < startedAt) throw new ArgumentOutOfRangeException(nameof(endedAt));
        var start = startedAt > window.StartsAt ? startedAt : window.StartsAt; var end = endedAt < window.EndsAt ? endedAt : window.EndsAt;
        return end > start ? (end - start).Ticks / (decimal)TimeSpan.TicksPerSecond : 0;
    }
}
