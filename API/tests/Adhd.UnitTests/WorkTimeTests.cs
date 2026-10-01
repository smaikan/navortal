using Adhd.Domain.Work;

namespace Adhd.UnitTests;

public sealed class WorkTimeTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    [Fact] public void PausesAreExcludedAndOpenWorkContinues()
    {
        WorkSessionSegment[] segments = [new() { StartedAt = Start, EndedAt = Start.AddMinutes(20) }, new() { StartedAt = Start.AddMinutes(50) }];
        Assert.Equal(3600m, WorkTime.Seconds(segments, Start.AddMinutes(90)));
    }
    [Fact] public void MicrosecondsAreNotRoundedAwayPerSegmentAndVoidsDoNotCount()
    {
        WorkSessionSegment[] segments = [new() { StartedAt = Start, EndedAt = Start.AddTicks(10) }, new() { StartedAt = Start, EndedAt = Start.AddTicks(10) }, new() { StartedAt = Start, EndedAt = Start.AddHours(1), IsVoided = true }];
        Assert.Equal(.000002m, WorkTime.Seconds(segments, Start));
    }
    [Fact] public void NegativeTimeCannotBecomePositiveOrSilentlyZero() => Assert.Throws<ArgumentOutOfRangeException>(() => WorkTime.Seconds(Start, Start.AddTicks(-10)));
}
