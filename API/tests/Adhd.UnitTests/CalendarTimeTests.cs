using Adhd.Domain.Planning;

namespace Adhd.UnitTests;

public sealed class CalendarTimeTests
{
    [Fact]
    public void MidnightWorkIsIntersectedIntoThirtyPlusThirtyWithoutDuplicatingSession()
    {
        var start = new DateTimeOffset(2026, 10, 15, 20, 30, 0, TimeSpan.Zero); var end = start.AddHours(1);
        var days = CalendarTime.Windows(new(2026, 10, 15), new(2026, 10, 16), ["Europe/Istanbul"]);
        Assert.Equal([1800m, 1800m], days.Select(x => CalendarTime.IntersectSeconds(start, end, x)).ToArray());
    }
    [Theory] [InlineData(2026, 3, 29, 23)] [InlineData(2026, 10, 25, 25)]
    public void DstUsesRealDayInstants(int year, int month, int day, int hours)
    {
        var date = new DateOnly(year, month, day); var window = Assert.Single(CalendarTime.Windows(date, date, ["Europe/Berlin"])); Assert.Equal(TimeSpan.FromHours(hours), window.EndsAt - window.StartsAt);
    }
    [Fact]
    public void FrozenZoneAndMicrosecondsRemainSeparateFromCurrentPreference()
    {
        var date = new DateOnly(2026, 10, 15); var windows = CalendarTime.Windows(date, date, ["Europe/Istanbul", "UTC", "UTC"]); Assert.Equal(2, windows.Length);
        var start = new DateTimeOffset(2026, 10, 15, 21, 30, 0, TimeSpan.Zero); var end = start.AddTicks(1234560);
        Assert.Equal(0m, CalendarTime.IntersectSeconds(start, end, windows.Single(x => x.TimeZoneId == "Europe/Istanbul"))); Assert.Equal(0.123456m, CalendarTime.IntersectSeconds(start, end, windows.Single(x => x.TimeZoneId == "UTC")));
    }
    [Fact]
    public void CalendarRangeIsBoundedAndTouchingBoundaryHasNoOverlap()
    {
        var date = new DateOnly(2026, 10, 15); Assert.Throws<ArgumentOutOfRangeException>(() => CalendarTime.Windows(date, date.AddDays(42), ["UTC"])); var window = Assert.Single(CalendarTime.Windows(date, date, ["UTC"])); Assert.Equal(0, CalendarTime.IntersectSeconds(window.StartsAt.AddHours(-1), window.StartsAt, window));
    }
}
