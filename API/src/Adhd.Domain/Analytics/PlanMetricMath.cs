namespace Adhd.Domain.Analytics;

public static class PlanMetricMath
{
    public static decimal? Ratio(decimal numerator, decimal denominator) => denominator > 0 ? numerator / denominator : null;
    public static decimal? Median(IEnumerable<decimal> values)
    {
        var a = values.Order().ToArray(); return a.Length == 0 ? null : a.Length % 2 == 1 ? a[a.Length / 2] : (a[a.Length / 2 - 1] + a[a.Length / 2]) / 2;
    }
    public static decimal UnionSeconds(IEnumerable<(DateTimeOffset Start, DateTimeOffset End)> intervals)
    {
        DateTimeOffset? a = null; DateTimeOffset b = default; decimal seconds = 0;
        foreach (var (start, end) in intervals.OrderBy(x => x.Start).ThenBy(x => x.End))
        {
            if (end <= start) continue;
            if (!a.HasValue) { a = start; b = end; }
            else if (start <= b) { if (end > b) b = end; }
            else { seconds += (b - a.Value).Ticks / (decimal)TimeSpan.TicksPerSecond; a = start; b = end; }
        }
        return seconds + (a.HasValue ? (b - a.Value).Ticks / (decimal)TimeSpan.TicksPerSecond : 0);
    }
}
