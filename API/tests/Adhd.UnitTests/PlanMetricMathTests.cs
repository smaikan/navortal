using Adhd.Domain.Analytics;

namespace Adhd.UnitTests;

public sealed class PlanMetricMathTests
{
    [Fact]
    public void EmptyDenominatorAndMissingSamplesAreNullRatherThanFabricatedZero()
    {
        Assert.Null(PlanMetricMath.Ratio(0, 0)); Assert.Equal(.5m, PlanMetricMath.Ratio(1, 2)); Assert.Null(PlanMetricMath.Median([])); Assert.Equal(150m, PlanMetricMath.Median([200m, 100m])); Assert.Equal(120m, PlanMetricMath.Median([600m, 120m, 60m]));
    }
    [Fact]
    public void SameTaskOverlapsAndTouchingIntervalsCannotInflateQuota()
    {
        var start = DateTimeOffset.UnixEpoch;
        Assert.Equal(1800m, PlanMetricMath.UnionSeconds([(start, start.AddMinutes(20)), (start.AddMinutes(10), start.AddMinutes(25)), (start.AddMinutes(25), start.AddMinutes(30))]));
        Assert.Equal(0m, PlanMetricMath.UnionSeconds([(start, start)]));
    }
}
