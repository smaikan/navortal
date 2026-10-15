using Adhd.Domain.Planning;
using Adhd.Domain.Work;

namespace Adhd.Domain.Analytics;

public enum AnalyticsBucket { Day, Week, Month }
public enum AnalyticsDimension { Task, Project, Category }
public sealed record ActiveSlice(DateOnly Date, DateTimeOffset StartsAt, DateTimeOffset EndsAt)
{
    public decimal Seconds => WorkTime.Seconds(StartsAt, EndsAt);
}
public static class AnalyticsTime
{
    public static bool ValidRange(DateOnly from, DateOnly to) => from.Year is >= 2 and <= 9998 && to.Year is >= 2 and <= 9998 && to.DayNumber - from.DayNumber is >= 0 and <= 365;
    public static ActiveSlice[] Slice(DateTimeOffset start, DateTimeOffset end, string zone, DateOnly from, DateOnly to)
    {
        if (!ValidRange(from, to) || end < start) throw new ArgumentOutOfRangeException(nameof(to));
        var lower = PlanTime.DayStart(from, zone); var upper = PlanTime.DayStart(to.AddDays(1), zone); start = start > lower ? start : lower; end = end < upper ? end : upper;
        var result = new List<ActiveSlice>();
        while (start < end)
        {
            var date = PlanTime.Date(start, zone); var boundary = PlanTime.DayStart(date.AddDays(1), zone); var finish = end < boundary ? end : boundary;
            if (finish <= start) throw new ArgumentException("Invalid local day boundary.", nameof(zone));
            result.Add(new(date, start, finish)); start = finish;
        }
        return result.ToArray();
    }
    public static DateOnly BucketStart(DateOnly date, AnalyticsBucket bucket, int weekStartsOn) => bucket switch
    {
        AnalyticsBucket.Day => date, AnalyticsBucket.Week => date.AddDays(-(((int)date.DayOfWeek - weekStartsOn + 7) % 7)),
        AnalyticsBucket.Month => new(date.Year, date.Month, 1), _ => throw new ArgumentOutOfRangeException(nameof(bucket))
    };
    // Eşiği hesaplarken duraklamaları atla. Aşım, eşikten sonra gerçekten çalışılan süre
    public static (DateTimeOffset? TargetAt, (DateTimeOffset Start, DateTimeOffset End)[] Overtime) FocusThreshold(
        IEnumerable<WorkSessionSegment> segments, DateTimeOffset start, DateTimeOffset end, int targetSeconds)
    {
        decimal consumed = 0; DateTimeOffset? target = null; var overtime = new List<(DateTimeOffset, DateTimeOffset)>();
        foreach (var s in segments.Where(x => !x.IsVoided).OrderBy(x => x.StartedAt).ThenBy(x => x.Id))
        {
            var a = s.StartedAt > start ? s.StartedAt : start; var b = (s.EndedAt ?? end) < end ? s.EndedAt!.Value : end; if (b <= a) continue;
            var seconds = WorkTime.Seconds(a, b); var remaining = Math.Max(0, targetSeconds - consumed);
            if (remaining <= seconds)
            {
                var threshold = a.AddTicks((long)(remaining * TimeSpan.TicksPerSecond)); target ??= threshold;
                if (b > threshold) overtime.Add((threshold, b));
            }
            consumed += seconds;
        }
        return (target, overtime.ToArray());
    }
}
