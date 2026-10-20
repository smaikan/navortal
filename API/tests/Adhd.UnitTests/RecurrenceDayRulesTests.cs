using Adhd.Domain.Analytics;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class RecurrenceDayRulesTests
{
    private static readonly DateOnly Today = new(2026, 11, 6), Past = new(2026, 11, 4);
    private static RecurrenceDayClass Task(TaskState? state, bool byDayEnd = false, DateOnly? date = null) => RecurrenceDayRules.Classify(OccurrenceState.Materialized, null, state, byDayEnd, date ?? Past, Today);

    [Fact]
    public void CompletionAtDayEndStaysOnTimeEvenIfReopenedLater() => Assert.Equal(RecurrenceDayClass.OnTime, Task(TaskState.Pending, byDayEnd: true));
    [Fact]
    public void CompletedAfterItsDayIsLate() => Assert.Equal(RecurrenceDayClass.Late, Task(TaskState.Completed));
    [Theory]
    [InlineData(TaskState.Pending)]
    [InlineData(TaskState.InProgress)]
    [InlineData(TaskState.Paused)]
    [InlineData(TaskState.Deferred)]
    public void OpenTaskIsNotDoneAfterItsDayAndPendingOnItsDay(TaskState state)
    {
        Assert.Equal(RecurrenceDayClass.NotDone, Task(state));
        Assert.Equal(RecurrenceDayClass.TodayPending, Task(state, date: Today));
    }
    [Theory]
    [InlineData(TaskState.Skipped)]
    [InlineData(TaskState.Canceled)]
    [InlineData(null)]
    public void DeliberatelyClosedOrDeletedTaskIsSkipped(TaskState? state) => Assert.Equal(RecurrenceDayClass.Skipped, Task(state));
    [Fact]
    public void UserMarkersAreSkippedAndSystemMarkersMeanNoTaskExisted()
    {
        Assert.Equal(RecurrenceDayClass.Skipped, RecurrenceDayRules.Classify(OccurrenceState.Skipped, OccurrenceReason.User, null, false, Past, Today));
        Assert.Equal(RecurrenceDayClass.Skipped, RecurrenceDayRules.Classify(OccurrenceState.Canceled, null, null, false, Past, Today));
        foreach (var reason in new[] { OccurrenceReason.SeriesPaused, OccurrenceReason.SeriesChanged, "DstGap" })
            Assert.Equal(RecurrenceDayClass.NotGenerated, RecurrenceDayRules.Classify(OccurrenceState.Skipped, reason, null, false, Past, Today));
    }
    [Fact]
    public void LongestRunResetsOnlyOnNotDone()
    {
        RecurrenceDayClass[] days = [RecurrenceDayClass.OnTime, RecurrenceDayClass.Skipped, RecurrenceDayClass.Late, RecurrenceDayClass.NotGenerated, RecurrenceDayClass.OnTime, RecurrenceDayClass.NotDone, RecurrenceDayClass.OnTime];
        Assert.Equal(3, RecurrenceDayRules.LongestRun(days)); Assert.Equal(0, RecurrenceDayRules.LongestRun([]));
    }
}
