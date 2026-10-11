namespace Adhd.Domain.Recurrence;

public enum RecurrenceFrequency { Daily, IntervalDays, Weekly, Monthly }
public enum MonthEndPolicy { Skip, ClampToLastDay }
public enum GapPolicy { Reject, Skip, ShiftForward }
public enum OverlapPolicy { Reject, Earlier, Later }
public sealed record RecurrenceRule(DateOnly StartDate, string TimeZoneId = "Europe/Istanbul", RecurrenceFrequency Frequency = RecurrenceFrequency.Daily,
    int Interval = 1, int[]? WeekDays = null, int? MonthDay = null, MonthEndPolicy? MonthEnd = null, DateOnly? UntilDate = null,
    TimeOnly? DueTime = null, GapPolicy Gap = GapPolicy.Reject, OverlapPolicy Overlap = OverlapPolicy.Reject, TimeOnly? StartTime = null, bool AutoAddToPlan = false);
public sealed record RecurrenceCandidate(DateOnly LocalDate, string TimeZoneId, TimeOnly? DueTime, DateTimeOffset? DueAt, bool Adjusted, bool Skipped, string? Reason);
public static class RecurrenceRules
{
    public static bool Valid(RecurrenceRule r)
    {
        if (r.StartDate.Year is < 2 or > 9998 || r.UntilDate < r.StartDate || r.UntilDate?.Year > 9998 || !Enum.IsDefined(r.Frequency) || !Enum.IsDefined(r.Gap) || !Enum.IsDefined(r.Overlap)
            || r.MonthEnd.HasValue && !Enum.IsDefined(r.MonthEnd.Value) || (r.DueTime?.Ticks % TimeSpan.TicksPerMinute > 0 || r.StartTime?.Ticks % TimeSpan.TicksPerMinute > 0) || string.IsNullOrWhiteSpace(r.TimeZoneId) || r.TimeZoneId.Length > 100
            || r.TimeZoneId != "UTC" && !TimeZoneInfo.TryConvertIanaIdToWindowsId(r.TimeZoneId, out _) || !TimeZoneInfo.TryFindSystemTimeZoneById(r.TimeZoneId, out _)) return false;
        var days = r.WeekDays ?? [];
        return r.Frequency switch
        {
            RecurrenceFrequency.Daily => r.Interval == 1 && days.Length == 0 && r.MonthDay is null && r.MonthEnd is null,
            RecurrenceFrequency.IntervalDays => r.Interval is >= 1 and <= 366 && days.Length == 0 && r.MonthDay is null && r.MonthEnd is null,
            RecurrenceFrequency.Weekly => r.Interval is >= 1 and <= 52 && days.Length is >= 1 and <= 7 && days.All(d => d is >= 0 and <= 6) && days.Distinct().Count() == days.Length && r.MonthDay is null && r.MonthEnd is null,
            RecurrenceFrequency.Monthly => r.Interval is >= 1 and <= 24 && days.Length == 0 && r.MonthDay is >= 1 and <= 31 && (r.MonthDay <= 28 || r.MonthEnd.HasValue),
            _ => false
        };
    }
    public static RecurrenceCandidate[] Generate(RecurrenceRule rule, DateOnly from, DateOnly to)
    {
        if (!Valid(rule) || from.Year is < 2 or > 9998 || to.Year is < 2 or > 9998 || to.DayNumber - from.DayNumber is < 0 or > 92) throw new ArgumentException("Invalid recurrence rule or explicit1..93 day window.");
        var result = new List<RecurrenceCandidate>();
        for (var date = from; date <= to; date = date.AddDays(1)) if (Matches(rule, date)) result.Add(Resolve(rule, date));
        return result.ToArray();
    }
    public static bool Matches(RecurrenceRule rule, DateOnly date)
    {
        if (date < rule.StartDate || date > rule.UntilDate) return false;
        var elapsed = date.DayNumber - rule.StartDate.DayNumber;
        return rule.Frequency switch
        {
            RecurrenceFrequency.Daily => true,
            RecurrenceFrequency.IntervalDays => elapsed % rule.Interval == 0,
            RecurrenceFrequency.Weekly => (date.DayNumber - (rule.StartDate.DayNumber - ((int)rule.StartDate.DayOfWeek + 6) % 7)) / 7 % rule.Interval == 0 && rule.WeekDays!.Contains((int)date.DayOfWeek),
            RecurrenceFrequency.Monthly => ((date.Year - rule.StartDate.Year) * 12 + date.Month - rule.StartDate.Month) % rule.Interval == 0 &&
                date.Day == (rule.MonthEnd == MonthEndPolicy.ClampToLastDay ? Math.Min(rule.MonthDay!.Value, DateTime.DaysInMonth(date.Year, date.Month)) : rule.MonthDay),
            _ => false
        };
    }
    public static RecurrenceCandidate Resolve(RecurrenceRule rule, DateOnly date)
    {
        if (!rule.DueTime.HasValue) return new(date, rule.TimeZoneId, null, null, false, false, null);
        var zone = TimeZoneInfo.FindSystemTimeZoneById(rule.TimeZoneId); var local = date.ToDateTime(rule.DueTime.Value, DateTimeKind.Unspecified); var adjusted = false;
        if (zone.IsInvalidTime(local))
        {
            if (rule.Gap == GapPolicy.Reject) throw new RecurrenceTimeException(date, "Yerel deadline saati DST boşluğunda; GapPolicy seçin.");
            if (rule.Gap == GapPolicy.Skip) return new(date, rule.TimeZoneId, rule.DueTime, null, false, true, "DstGap");
            do { local = local.AddMinutes(1); } while (zone.IsInvalidTime(local)); adjusted = true;
        }
        TimeSpan offset;
        if (zone.IsAmbiguousTime(local))
        {
            if (rule.Overlap == OverlapPolicy.Reject) throw new RecurrenceTimeException(date, "Yerel deadline saati iki kez oluşuyor; OverlapPolicy seçin.");
            var offsets = zone.GetAmbiguousTimeOffsets(local); offset = rule.Overlap == OverlapPolicy.Earlier ? offsets.Max() : offsets.Min();
        }
        else offset = zone.GetUtcOffset(local);
        return new(date, rule.TimeZoneId, rule.DueTime, new DateTimeOffset(local, offset).ToUniversalTime(), adjusted, false, null);
    }
}
public sealed class RecurrenceTimeException(DateOnly localDate, string message) : ArgumentException(message)
{
    public DateOnly LocalDate { get; } = localDate;
}
