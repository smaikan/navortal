using Adhd.Domain.Recurrence;

namespace Adhd.UnitTests;

public sealed class RecurrenceRulesTests
{
    [Fact]
    public void DailyAndCustomIntervalStayAnchoredAndBoundedByStartAndInclusiveUntil()
    {
        var start = new DateOnly(2026, 10, 15); var rule = new RecurrenceRule(start, Frequency: RecurrenceFrequency.IntervalDays, Interval: 3, UntilDate: start.AddDays(8));
        var result = RecurrenceRules.Generate(rule, start.AddDays(-2), start.AddDays(10)); Assert.Equal(new[] { start, start.AddDays(3), start.AddDays(6) }, result.Select(x => x.LocalDate)); Assert.All(result, x => Assert.Null(x.DueAt));
        Assert.Throws<ArgumentException>(() => RecurrenceRules.Generate(rule, start, start.AddDays(93)));
    }
    [Fact]
    public void WeeklySelectedDaysUseMondayAnchorAndDoNotRestartAtEachRequestedWindow()
    {
        var rule = new RecurrenceRule(new(2026, 10, 14), Frequency: RecurrenceFrequency.Weekly, Interval: 2, WeekDays: [1, 3]);
        var dates = RecurrenceRules.Generate(rule, new(2026, 10, 12), new(2026, 11, 1)).Select(x => x.LocalDate).ToArray(); Assert.Equal(new[] { new DateOnly(2026, 10, 14), new(2026, 10, 26), new(2026, 10, 28) }, dates);
        Assert.Equal(dates.Skip(1), RecurrenceRules.Generate(rule, new(2026, 10, 20), new(2026, 11, 1)).Select(x => x.LocalDate));
    }
    [Theory] [InlineData(2026, 28)] [InlineData(2028, 29)]
    public void MonthlyClampIsExplicitAndLeapYearAware(int year, int februaryDay)
    {
        var rule = new RecurrenceRule(new(year, 1, 31), Frequency: RecurrenceFrequency.Monthly, MonthDay: 31, MonthEnd: MonthEndPolicy.ClampToLastDay);
        var dates = RecurrenceRules.Generate(rule, new(year, 1, 1), new(year, 3, 31)).Select(x => x.LocalDate); Assert.Equal(new[] { new DateOnly(year, 1, 31), new(year, 2, februaryDay), new(year, 3, 31) }, dates);
        Assert.Equal(2, RecurrenceRules.Generate(rule with { MonthEnd = MonthEndPolicy.Skip }, new(year, 1, 1), new(year, 3, 31)).Length);
        Assert.False(RecurrenceRules.Valid(rule with { MonthEnd = null }));
    }
    [Fact]
    public void InvalidSpringDeadlineRequiresPolicyAndSkipOrShiftKeepsOriginalOccurrenceDate()
    {
        var date = new DateOnly(2026, 3, 29); var rule = new RecurrenceRule(date, "Europe/Berlin", DueTime: new(2, 30)); Assert.Throws<RecurrenceTimeException>(() => RecurrenceRules.Generate(rule, date, date));
        Assert.True(Assert.Single(RecurrenceRules.Generate(rule with { Gap = GapPolicy.Skip }, date, date)).Skipped);
        var shifted = Assert.Single(RecurrenceRules.Generate(rule with { Gap = GapPolicy.ShiftForward }, date, date)); Assert.True(shifted.Adjusted); Assert.Equal(date, shifted.LocalDate); Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), shifted.DueAt); Assert.Equal(new TimeOnly(2, 30), shifted.DueTime);
    }
    [Fact]
    public void AmbiguousAutumnDeadlineRequiresExplicitEarlierOrLaterInstant()
    {
        var date = new DateOnly(2026, 10, 25); var rule = new RecurrenceRule(date, "Europe/Berlin", DueTime: new(2, 30)); Assert.Throws<RecurrenceTimeException>(() => RecurrenceRules.Generate(rule, date, date));
        var earlier = RecurrenceRules.Resolve(rule with { Overlap = OverlapPolicy.Earlier }, date); var later = RecurrenceRules.Resolve(rule with { Overlap = OverlapPolicy.Later }, date); Assert.Equal(TimeSpan.FromHours(1), later.DueAt - earlier.DueAt); Assert.Equal(earlier.LocalDate, later.LocalDate);
    }
    [Fact]
    public void InvalidFrequencyShapesAndNonIanaZonesAreRejected()
    {
        var rule = new RecurrenceRule(new(2026, 10, 15)); Assert.True(RecurrenceRules.Valid(rule)); Assert.False(RecurrenceRules.Valid(rule with { Interval = 0 })); Assert.False(RecurrenceRules.Valid(rule with { TimeZoneId = "Not/AZone" })); Assert.False(RecurrenceRules.Valid(rule with { DueTime = new(2, 30, 1) })); Assert.False(RecurrenceRules.Valid(rule with { Frequency = RecurrenceFrequency.Weekly, WeekDays = [1, 1] }));
    }
}
