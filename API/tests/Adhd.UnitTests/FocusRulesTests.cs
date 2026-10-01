using Adhd.Domain.Focus;
using Adhd.Domain.Work;

namespace Adhd.UnitTests;

public sealed class FocusRulesTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static WorkSessionSegment Segment(int startMinutes, int? endMinutes = null, bool isVoided = false) => new() { Id = Guid.NewGuid(), StartedAt = Start.AddMinutes(startMinutes), EndedAt = endMinutes.HasValue ? Start.AddMinutes(endMinutes.Value) : null, IsVoided = isVoided };
    [Fact]
    public void PauseDoesNotConsumeTargetAndReachedInstantIncludesPauseGap()
    {
        var f = new FocusSession { StartedAt = Start }; var settings = new FocusSettings(2100, 420); var parts = new[] { Segment(0, 20), Segment(50) };
        var before = FocusRules.Measure(f, settings, parts, Start.AddMinutes(60)); Assert.Equal(1800m, before.ActiveSeconds); Assert.Equal(300m, before.RemainingSeconds); Assert.Null(before.TargetInstant);
        var after = FocusRules.Measure(f, settings, parts, Start.AddMinutes(75)); Assert.Equal(2700m, after.ActiveSeconds); Assert.Equal(600m, after.OvertimeSeconds); Assert.Equal(Start.AddMinutes(65), after.TargetInstant);
    }
    [Fact]
    public void CycleBoundariesExcludePreviousWorkAndBreakAndCorrectionsUseEffectiveSegments()
    {
        var f = new FocusSession { StartedAt = Start.AddMinutes(10), WorkEndedAt = Start.AddMinutes(20) };
        var parts = new[] { Segment(0, 20), Segment(25, 35), Segment(40, 50, true) };
        var measured = FocusRules.Measure(f, new(300), parts, Start.AddHours(1)); Assert.Equal(600m, measured.ActiveSeconds); Assert.Equal(300m, measured.OvertimeSeconds); Assert.Equal(Start.AddMinutes(15), measured.TargetInstant);
    }
    [Theory] [InlineData(1, 420)] [InlineData(3, 420)] [InlineData(4, 1200)] [InlineData(8, 1200)]
    public void LongBreakCadenceIsExplicitAndWorkDurationIsIndependent(int cycle, int expected) => Assert.Equal(expected, FocusRules.BreakSeconds(new(2100, 420, 1200), cycle));
    [Fact]
    public void MicrosecondsRemainExactAndInvalidSettingsOrFutureClockAreRejected()
    {
        var f = new FocusSession { StartedAt = Start }; var part = Segment(0); var m = FocusRules.Measure(f, new(1), [part], Start.AddSeconds(1).AddTicks(10)); Assert.Equal(1.000001m, m.ActiveSeconds); Assert.Equal(.000001m, m.OvertimeSeconds);
        Assert.False(FocusRules.Valid(new(0))); Assert.False(FocusRules.Valid(new(LongBreakEvery: 0))); Assert.False(FocusRules.Valid(new(TargetBehavior: (FocusTargetBehavior)99)));
        Assert.Throws<ArgumentOutOfRangeException>(() => FocusRules.Measure(f, new(), [part], Start.AddSeconds(-1)));
    }
}
