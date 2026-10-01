using Adhd.Domain.Planning;

namespace Adhd.UnitTests;

public sealed class PlanTimeTests
{
    [Fact] public void OvernightPreservesOneHourAndSharedBoundary()
    {
        var start = new DateTimeOffset(2026, 10, 15, 23, 30, 0, TimeSpan.FromHours(3));
        var parts = PlanTime.Split(start, start.AddHours(1), "Europe/Istanbul"); Assert.Equal(2, parts.Length);
        Assert.All(parts, x => Assert.Equal(TimeSpan.FromMinutes(30), x.EndsAt - x.StartsAt)); Assert.Equal(parts[0].EndsAt, parts[1].StartsAt);
    }
    [Fact] public void MidnightEndDoesNotProduceEmptyNextDay()
    {
        var start = new DateTimeOffset(2026, 10, 15, 20, 0, 0, TimeSpan.Zero); Assert.Single(PlanTime.Split(start, start.AddHours(1), "Europe/Istanbul"));
    }
    [Theory] [InlineData(2026, 3, 29, 23)] [InlineData(2026, 10, 25, 25)]
    public void DstDayLengthUsesInstants(int year, int month, int day, int hours)
    {
        var date = new DateOnly(year, month, day); var start = PlanTime.DayStart(date, "Europe/Berlin"); var end = PlanTime.DayStart(date.AddDays(1), "Europe/Berlin");
        Assert.Equal(TimeSpan.FromHours(hours), end - start); Assert.Single(PlanTime.Split(start, end, "Europe/Berlin"));
    }
    [Fact] public void TouchingBlocksDoNotOverlap() => Assert.False(PlanTime.Overlaps(DateTimeOffset.UnixEpoch, DateTimeOffset.UnixEpoch.AddHours(1), DateTimeOffset.UnixEpoch.AddHours(1), DateTimeOffset.UnixEpoch.AddHours(2)));
}
