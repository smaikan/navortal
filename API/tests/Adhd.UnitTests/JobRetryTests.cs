using Adhd.Domain.Jobs;

namespace Adhd.UnitTests;

public sealed class JobRetryTests
{
    [Theory] [InlineData(1, 2)] [InlineData(2, 4)] [InlineData(5, 32)] [InlineData(100, 256)]
    public void RetryDelayIsExponentialAndBounded(int attempt, int seconds) => Assert.Equal(TimeSpan.FromSeconds(seconds), JobRetry.Delay(attempt));
}
