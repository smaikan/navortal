using Adhd.Domain.Analytics;
using Adhd.Domain.Work;

namespace Adhd.UnitTests;

public sealed class AnalyticsTimeTests
{
    [Fact]
    public void FocusThresholdConsumesActualIntervalsAndNeverPauseTime()
    {
        var a = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
        var result = AnalyticsTime.FocusThreshold([new() { StartedAt = a, EndedAt = a.AddMinutes(5) }, new() { StartedAt = a.AddMinutes(20), EndedAt = a.AddMinutes(30) }], a, a.AddMinutes(30), 600);
        Assert.Equal(a.AddMinutes(25), result.TargetAt); var interval = Assert.Single(result.Overtime); Assert.Equal(300m, WorkTime.Seconds(interval.Start, interval.End));
    }
    [Fact]
    public void VoidedAndLaterThanCutoffWorkCannotReachHistoricalTarget()
    {
        var a = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
        var result = AnalyticsTime.FocusThreshold([new() { StartedAt = a, EndedAt = a.AddHours(1), IsVoided = true }, new() { StartedAt = a.AddHours(1), EndedAt = a.AddHours(2) }], a, a.AddMinutes(90), 2700);
        Assert.Null(result.TargetAt); Assert.Empty(result.Overtime);
    }
    [Fact]
    public void BucketAnchorsAndDayIntersectionUseCalendarRatherThanFixedDaySeconds()
    {
        Assert.Equal(new DateOnly(2026, 10, 11), AnalyticsTime.BucketStart(new(2026, 10, 15), AnalyticsBucket.Week, 0));
        var date = new DateOnly(2026, 10, 25); var parts = AnalyticsTime.Slice(new(2026, 10, 24, 22, 0, 0, TimeSpan.Zero), new(2026, 10, 25, 23, 0, 0, TimeSpan.Zero), "Europe/Berlin", date, date);
        Assert.Equal(90000m, Assert.Single(parts).Seconds); Assert.False(AnalyticsTime.ValidRange(date, date.AddDays(366)));
    }
}
