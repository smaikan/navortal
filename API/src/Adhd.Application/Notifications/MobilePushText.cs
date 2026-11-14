using System.Text.RegularExpressions;

namespace Adhd.Application.Notifications;

/// <summary>Mobil FCM bildirimi için zaman/ad içeren başlık ve metin kaynağı. Web Push metnini etkilemez.</summary>
public sealed record MobilePushTextInput(string Kind, string? Name, string? Note, DateTimeOffset OccurredAt, DateTimeOffset Now,
    string TimeZoneId, DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, DateOnly? RangeEnd = null,
    int? FocusWorkSeconds = null, string? SpecialDayKind = null);

public static partial class MobilePushText
{
    public const int TitleMax = 120, BodyMax = 300, NoteMax = 80;
    public const string GenericTitle = "Navortal", GenericBody = "Yeni bir hatırlatman var.", FallbackTask = "Planındaki bir görev";
    private static readonly string[] Months = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

    public static NotificationMessage Build(MobilePushTextInput i)
    {
        var zone = Zone(i.TimeZoneId);
        string Clock(DateTimeOffset t) => TimeZoneInfo.ConvertTime(t, zone).ToString("HH:mm", System.Globalization.CultureInfo.InvariantCulture);
        var name = Clean(i.Name);
        var note = SafeNote(i.Note);
        var withNote = (string body) => note is null ? body : $"{body} · {note}";
        (string Title, string Body) text = i.Kind switch
        {
            "ScheduleStart" => (name ?? FallbackTask, withNote(i.StartsAt is { } s && i.EndsAt is { } e
                ? $"{Clock(s)} – {Clock(e)} arası başlıyor" : $"{Clock(i.OccurredAt)} saatinde başlıyor")),
            "ScheduleEnd" => (name ?? FallbackTask, $"Bitiş saati {Clock(i.EndsAt ?? i.OccurredAt)}"),
            "TaskDeadline" => (name ?? "Tarih aralığı biten görev", RangeEndText(i.RangeEnd ?? DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(i.OccurredAt, zone).Date), i.Now, zone)),
            "FocusTarget" => (name ?? "Odak oturumu", i.FocusWorkSeconds is > 0 and var w
                ? $"Hedeflediğin {Duration(w)} odak süresi doldu" : "Hedeflediğin odak süresi doldu"),
            "BreakEnd" => ("Mola bitti", name is null ? "Yeni bir odak oturumuna başlayabilirsin." : $"Göreve dön: {name}"),
            "ReturnToTask" => (name ?? FallbackTask, "Çalışmaya ara verdin, devam et"),
            "Custom" => (name ?? "Hatırlatma", note ?? $"Hatırlatma saati {Clock(i.OccurredAt)}"),
            "SpecialDay" => (name ?? "Özel gün", SpecialDayBody(i.SpecialDayKind, TimeZoneInfo.ConvertTime(i.OccurredAt, zone))),
            _ => (GenericTitle, GenericBody),
        };
        return new(Truncate(text.Title, TitleMax), Truncate(text.Body, BodyMax));
    }

    /// <summary>Aralık bitişi: yalnız gün bilgisi var, saat ve kalan süre yok.</summary>
    private static string RangeEndText(DateOnly end, DateTimeOffset now, TimeZoneInfo zone)
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).Date);
        var day = end == today ? "bugün" : end == today.AddDays(1) ? "yarın" : end < today ? $"{end.Day} {Months[end.Month - 1]} (geçti)" : $"{end.Day} {Months[end.Month - 1]}";
        return $"Aralığın son günü {day}";
    }

    private static string Duration(int seconds)
    {
        var minutes = Math.Max(1, (int)Math.Round(seconds / 60.0));
        return minutes < 60 ? $"{minutes} dk" : minutes % 60 == 0 ? $"{minutes / 60} sa" : $"{minutes / 60} sa {minutes % 60} dk";
    }

    private static string SpecialDayBody(string? kind, DateTimeOffset local)
    {
        var label = kind switch { "Birthday" => "Doğum günü", "Anniversary" => "Yıl dönümü", "Holiday" => "Tatil", _ => "Özel gün" };
        return $"{label} · {local.Day} {Months[local.Month - 1]}";
    }

    private static TimeZoneInfo Zone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }

    private static string? Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = Whitespace().Replace(Control().Replace(value, " "), " ").Trim();
        return text.Length == 0 ? null : text;
    }

    /// <summary>Kısa not: yalnız ilk satır. E-posta, telefon veya parola benzeri içerik varsa not hiç kullanılmaz.</summary>
    public static string? SafeNote(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var line = Clean(value.Split('\n', '\r')[0]);
        if (line is null || Sensitive().IsMatch(line)) return null;
        return Truncate(line, NoteMax);
    }

    /// <summary>Anlamlı yerde (kelime sonu) keser ve "…" ekler; UTF-16 çiftini bölmez; sonuç max'ı aşmaz.</summary>
    public static string Truncate(string value, int max)
    {
        if (value.Length <= max) return value;
        var end = max - 1;
        if (char.IsHighSurrogate(value[end - 1])) end--;
        var cut = value.LastIndexOfAny([' ', ',', ';', ':', '·', '-', '–'], end - 1, Math.Min(end, Math.Max(1, end / 4 + 20)));
        var head = (cut > end / 2 ? value[..cut] : value[..end]).TrimEnd(' ', ',', ';', ':', '·', '-', '–');
        return head + "…";
    }

    [GeneratedRegex(@"\s+")] private static partial Regex Whitespace();
    [GeneratedRegex(@"\p{C}")] private static partial Regex Control();
    [GeneratedRegex(@"[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{6,}\d|parola|şifre|sifre|password|passwd|\bpin\b|\bcvv\b|iban", RegexOptions.IgnoreCase)]
    private static partial Regex Sensitive();
}
