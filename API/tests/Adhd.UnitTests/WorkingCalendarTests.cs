using Adhd.Domain.Preferences;

namespace Adhd.UnitTests;

public sealed class WorkingCalendarTests
{
    [Fact]
    public void EmptyCalendarNeverInventsWorkingHours()
    {
        var p = new PlanningPreferences();
        Assert.Null(WorkingCalendar.Validate(p));
        Assert.Empty(WorkingCalendar.UtcIntervals(p, new DateOnly(2026, 10, 15)));
        Assert.Equal(900, p.MinimumSplitSeconds); Assert.Equal(0, p.TransitionSeconds); Assert.Equal("Preview", p.PlanningMode);
    }
    [Fact]
    public void ExceptionsReplaceWeeklyHoursAndAnEmptyExceptionClosesTheDay()
    {
        var monday = new DateOnly(2026, 10, 19);
        var p = new PlanningPreferences
        {
            Weekly = [new(1, 540, 720), new(1, 780, 1020), new(2, 600, 900)],
            Exceptions = [new(monday, [new(600, 660)]), new(monday.AddDays(1), [])]
        };
        Assert.Null(WorkingCalendar.Validate(p));
        Assert.Equal([new MinuteRange(600, 660)], WorkingCalendar.LocalIntervals(p, monday));
        Assert.Empty(WorkingCalendar.LocalIntervals(p, monday.AddDays(1)));
        Assert.Equal(2, WorkingCalendar.LocalIntervals(p, monday.AddDays(7)).Length);
    }
    [Fact]
    public void MidnightAndIstanbulConversionUseHalfOpenRanges()
    {
        var date = new DateOnly(2026, 10, 19);
        var p = new PlanningPreferences { Weekly = [new(1, 1380, 1440), new(2, 0, 60)] };
        Assert.Null(WorkingCalendar.Validate(p));
        var today = Assert.Single(WorkingCalendar.UtcIntervals(p, date));
        var tomorrow = Assert.Single(WorkingCalendar.UtcIntervals(p, date.AddDays(1)));
        Assert.Equal(today.EndsAt, tomorrow.StartsAt);
        Assert.Equal(new DateTimeOffset(2026, 10, 19, 20, 0, 0, TimeSpan.Zero), today.StartsAt);
    }
    [Fact]
    public void DstGapUsesFirstValidMinuteAndAmbiguousTimeUsesEarlierInstant()
    {
        var p = new PlanningPreferences { TimeZoneId = "Europe/Berlin", Weekly = [new(0, 150, 210)] };
        var spring = Assert.Single(WorkingCalendar.UtcIntervals(p, new DateOnly(2026, 3, 29)));
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), spring.StartsAt);
        Assert.Equal(TimeSpan.FromMinutes(30), spring.EndsAt - spring.StartsAt);
        var fall = Assert.Single(WorkingCalendar.UtcIntervals(p, new DateOnly(2026, 10, 25)));
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 0, 30, 0, TimeSpan.Zero), fall.StartsAt);
        Assert.Equal(TimeSpan.FromMinutes(120), fall.EndsAt - fall.StartsAt);
    }
    [Fact]
    public void AdjacentRangesAreAllowedButOverlapZeroAndImplicitOvernightAreNot()
    {
        Assert.Null(WorkingCalendar.Validate(new() { Weekly = [new(1, 540, 600), new(1, 600, 660)] }));
        foreach (var weekly in new WeeklyWindow[][] { [new(1, 540, 610), new(1, 600, 660)], [new(1, 600, 600)], [new(1, 1380, 60)] })
            Assert.NotNull(WorkingCalendar.Validate(new() { Weekly = weekly }));
    }
}
