using Adhd.Application.Common;

namespace Adhd.UnitTests;

public sealed class UtcTimeProviderTests
{
    [Fact]
    public void ClockNormalizesOffsetAndTruncatesToPostgresMicrosecondsWithoutRoundingForward()
    {
        var input = new DateTimeOffset(2026, 10, 15, 12, 0, 0, TimeSpan.FromHours(3)).AddTicks(1234567);
        var actual = new UtcTimeProvider(new FixedClock(input)).GetUtcNow();
        Assert.Equal(TimeSpan.Zero, actual.Offset); Assert.Equal(0, actual.Ticks % 10);
        Assert.Equal(input.ToUniversalTime().Ticks - 7, actual.Ticks); Assert.True(actual <= input);
    }
    private sealed class FixedClock(DateTimeOffset value) : TimeProvider { public override DateTimeOffset GetUtcNow() => value; }
}
