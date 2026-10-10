namespace Adhd.Domain.SpecialDays;

public enum SpecialDayKind { Birthday, Anniversary, Holiday, Other }
public enum SpecialDayRecurrence { Yearly, Once }
public enum SpecialDayReminder { None, SameDay, OneDayBefore, OneWeekBefore }

// Özel gün kendi tarihinde görünür.
// Yıllık 29 Şubat diğer
// yıllarda 28 Şubat'a düşer.
// Çalışma dışı gün kapasiteyi
// etkiler, kayıtlı planı taşımaz.
public sealed class SpecialDay
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = "";
    public SpecialDayKind Kind { get; set; }
    public int Month { get; set; }
    public int Day { get; set; }
    public int? Year { get; set; }
    public SpecialDayRecurrence Recurrence { get; set; }
    public bool NonWorking { get; set; }
    public SpecialDayReminder Reminder { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
}

public static class SpecialDayRules
{
    public const int TitleMax = 120;
    public static readonly TimeOnly ReminderTime = new(9, 0);

    public static string? Validate(string title, int month, int day, int? year, SpecialDayRecurrence recurrence)
    {
        if (title.Length is < 1 or > TitleMax) return "Ad 1–120 karakter olmalı.";
        if (month is < 1 or > 12) return "Geçerli bir ay seçin.";
        // 29 Şubat yıllık özel gün olabilir. Artık yıl değilse 28 Şubat'ta göster.
        if (day < 1 || day > DateTime.DaysInMonth(2000, month)) return "Geçerli bir gün seçin.";
        if (year is { } y && (y < 1 || y > 9998)) return "Geçerli bir yıl seçin.";
        if (recurrence == SpecialDayRecurrence.Once)
        {
            if (year is null) return "Tek seferlik gün için yıl gerekli.";
            if (day > DateTime.DaysInMonth(year.Value, month)) return "Bu yılda böyle bir gün yok.";
        }
        return null;
    }

    // O yıl özel günün düştüğü tarihi dön. Tekrar yoksa null.
    public static DateOnly? In(SpecialDay d, int year)
    {
        if (year is < 1 or > 9999) return null;
        if (d.Recurrence == SpecialDayRecurrence.Once) return d.Year == year ? new DateOnly(year, d.Month, d.Day) : null;
        if (d.Year is { } start && year < start) return null;
        var day = Math.Min(d.Day, DateTime.DaysInMonth(year, d.Month));
        return new DateOnly(year, d.Month, day);
    }

    public static IEnumerable<DateOnly> Occurrences(SpecialDay d, DateOnly from, DateOnly to)
    {
        for (var year = from.Year; year <= to.Year; year++)
            if (In(d, year) is { } date && date >= from && date <= to) yield return date;
    }

    public static DateOnly ReminderDate(DateOnly occurrence, SpecialDayReminder reminder) => reminder switch
    {
        SpecialDayReminder.OneDayBefore => occurrence.AddDays(-1),
        SpecialDayReminder.OneWeekBefore => occurrence.AddDays(-7),
        _ => occurrence,
    };

    // zoneId ile hatırlatma gününün 09:00 saatini al. Yaz saati boşluğuna denk gelirse sonraki geçerli dakikayı kullan.
    public static DateTimeOffset ReminderInstant(DateOnly occurrence, SpecialDayReminder reminder, string zoneId)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
        var wall = ReminderDate(occurrence, reminder).ToDateTime(ReminderTime, DateTimeKind.Unspecified);
        for (var i = 0; zone.IsInvalidTime(wall) && i < 180; i++) wall = wall.AddMinutes(1);
        var offset = zone.IsAmbiguousTime(wall) ? zone.GetAmbiguousTimeOffsets(wall).Max() : zone.GetUtcOffset(wall);
        return new DateTimeOffset(wall, offset).ToUniversalTime();
    }
}
