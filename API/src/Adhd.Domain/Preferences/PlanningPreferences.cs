using System.Globalization;

namespace Adhd.Domain.Preferences;

public sealed record MinuteRange(int StartMinute, int EndMinute);
public sealed record WeeklyWindow(int DayOfWeek, int StartMinute, int EndMinute);
public sealed record DateOverride(DateOnly Date, MinuteRange[] Intervals);
public sealed record PlanningPreferences
{
    public string TimeZoneId { get; init; } = "Europe/Istanbul";
    public string Language { get; init; } = "tr";
    public string TimeFormat { get; init; } = "24h";
    public int WeekStartsOn { get; init; } = 1;
    public string PlanningMode { get; init; } = "Preview";
    public string ParentCompletionPolicy { get; init; } = "Ask";
    public int MinimumSplitSeconds { get; init; } = 900;
    public int TransitionSeconds { get; init; }
    public bool SupportEnabled { get; init; } = true;
    public WeeklyWindow[] Weekly { get; init; } = [];
    public DateOverride[] Exceptions { get; init; } = [];
}
public sealed record UtcWindow(DateTimeOffset StartsAt, DateTimeOffset EndsAt);

public static class WorkingCalendar
{
    public static string? Validate(PlanningPreferences p)
    {
        if (string.IsNullOrWhiteSpace(p.TimeZoneId) || p.TimeZoneId.Length > 100
            || (p.TimeZoneId != "UTC" && !TimeZoneInfo.TryConvertIanaIdToWindowsId(p.TimeZoneId, out _))
            || !TimeZoneInfo.TryFindSystemTimeZoneById(p.TimeZoneId, out _)) return "Geçerli bir IANA zaman dilimi seçin.";
        try { if (string.IsNullOrWhiteSpace(p.Language) || p.Language.Length > 20) return "Dil geçersiz."; _ = CultureInfo.GetCultureInfo(p.Language); }
        catch (CultureNotFoundException) { return "Dil geçersiz."; }
        if (p.TimeFormat is not ("12h" or "24h") || p.WeekStartsOn is < 0 or > 6 || p.PlanningMode is not ("Preview" or "Auto")) return "Görünüm veya planlama tercihi geçersiz.";
        if (p.ParentCompletionPolicy is not ("Ask" or "CompleteSubtree" or "ParentOnly")) return "Üst görev tamamlama tercihi geçersiz.";
        if (p.MinimumSplitSeconds is < 1 or > 86400 || p.TransitionSeconds is < 0 or > 86400) return "Parça ve tampon süreleri geçersiz.";
        if (p.Weekly is null || p.Exceptions is null || p.Weekly.Length > 70 || p.Exceptions.Length > 366) return "Çalışma takvimi sınırları geçersiz.";
        if (p.Weekly.Any(x => x is null || x.DayOfWeek is < 0 or > 6)) return "Hafta günü geçersiz.";
        if (p.Weekly.GroupBy(x => x.DayOfWeek).Any(g => !ValidRanges(g.Select(x => new MinuteRange(x.StartMinute, x.EndMinute))))) return "Haftalık aralıklar geçersiz veya çakışıyor.";
        if (p.Exceptions.Any(x => x is null || x.Intervals is null || x.Intervals.Length > 24 || !ValidRanges(x.Intervals))
            || p.Exceptions.GroupBy(x => x.Date).Any(g => g.Count() > 1)) return "Tarih istisnaları geçersiz veya yineleniyor.";
        return null;
    }
    private static bool ValidRanges(IEnumerable<MinuteRange> ranges)
    {
        var end = 0;
        foreach (var range in ranges.OrderBy(x => x?.StartMinute))
        {
            if (range is null || range.StartMinute < end || range.StartMinute < 0 || range.EndMinute > 1440 || range.StartMinute >= range.EndMinute) return false;
            end = range.EndMinute;
        }
        return true;
    }
    public static MinuteRange[] LocalIntervals(PlanningPreferences p, DateOnly date) =>
        (p.Exceptions.SingleOrDefault(x => x.Date == date)?.Intervals
            ?? p.Weekly.Where(x => x.DayOfWeek == (int)date.DayOfWeek).Select(x => new MinuteRange(x.StartMinute, x.EndMinute)).ToArray())
        .OrderBy(x => x.StartMinute).ToArray();
    public static UtcWindow[] UtcIntervals(PlanningPreferences p, DateOnly date)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(p.TimeZoneId);
        var midnight = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return LocalIntervals(p, date).Select(x => new UtcWindow(ToUtc(midnight.AddMinutes(x.StartMinute), zone), ToUtc(midnight.AddMinutes(x.EndMinute), zone)))
            .Where(x => x.StartsAt < x.EndsAt).ToArray();
    }
    private static DateTimeOffset ToUtc(DateTime local, TimeZoneInfo zone)
    {
        while (zone.IsInvalidTime(local)) local = local.AddMinutes(1);
        var offset = zone.IsAmbiguousTime(local) ? zone.GetAmbiguousTimeOffsets(local).Max() : zone.GetUtcOffset(local);
        return new DateTimeOffset(local, offset).ToUniversalTime();
    }
}
