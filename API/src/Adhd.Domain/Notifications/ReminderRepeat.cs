using Adhd.Domain.Recurrence;

namespace Adhd.Domain.Notifications;

public sealed record ReminderRepeat(string TimeZoneId, TimeOnly LocalTime, int[] WeekDays);

public static class ReminderRepeatRules
{
    private static RecurrenceRule Rule(ReminderRepeat repeat, DateOnly date) => new(date, repeat.TimeZoneId,
        RecurrenceFrequency.Weekly, WeekDays: repeat.WeekDays, DueTime: repeat.LocalTime,
        Gap: GapPolicy.ShiftForward, Overlap: OverlapPolicy.Later);
    public static bool Valid(ReminderRepeat repeat) => repeat.WeekDays is not null && RecurrenceRules.Valid(Rule(repeat, new(2000, 1, 1)));
    public static DateTimeOffset Next(ReminderRepeat repeat, DateTimeOffset from, bool inclusive = false)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(repeat.TimeZoneId);
        var date = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(from, zone).DateTime);
        for (var i = 0; i <= 8; i++)
        {
            var day = date.AddDays(i);
            if (!repeat.WeekDays.Contains((int)day.DayOfWeek)) continue;
            var at = RecurrenceRules.Resolve(Rule(repeat, day), day).DueAt!.Value;
            if (at > from || inclusive && at == from) return at;
        }
        throw new ArgumentOutOfRangeException(nameof(from));
    }
    public static bool Matches(ReminderRepeat repeat, DateTimeOffset anchor, DateTimeOffset at)
    {
        if (at == anchor) return true;
        if (at < anchor) return false;
        return Next(repeat, at, true) == at;
    }
}
