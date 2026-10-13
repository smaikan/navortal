using Adhd.Domain.Notifications;

namespace Adhd.UnitTests;

public sealed class ReminderRepeatTests
{
    [Fact]
    public void SelectedWeekdaysPreserveLocalTimeAndSkipToNextWeek()
    {
        var rule = new ReminderRepeat("Europe/Istanbul", new(9, 30), [1, 3]);
        Assert.True(ReminderRepeatRules.Valid(rule));
        var monday = new DateTimeOffset(2026, 10, 26, 6, 30, 0, TimeSpan.Zero);
        Assert.Equal(monday, ReminderRepeatRules.Next(rule, monday, true));
        Assert.Equal(monday.AddDays(2), ReminderRepeatRules.Next(rule, monday));
        Assert.Equal(monday.AddDays(7), ReminderRepeatRules.Next(rule, monday.AddDays(2)));
        Assert.False(ReminderRepeatRules.Matches(rule, monday, monday.AddDays(1)));
    }
    [Fact]
    public void DstGapAdvancesToFirstValidMinuteAndOverlapUsesLaterOccurrenceOnce()
    {
        var rule = new ReminderRepeat("Europe/Berlin", new(2, 30), [0]);
        var spring = ReminderRepeatRules.Next(rule, new(2026, 3, 28, 0, 0, 0, TimeSpan.Zero));
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), spring);
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 1, 30, 0, TimeSpan.Zero), ReminderRepeatRules.Next(rule, new(2026, 10, 24, 0, 0, 0, TimeSpan.Zero)));
    }
}
