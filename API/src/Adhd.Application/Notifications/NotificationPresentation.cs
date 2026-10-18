using Adhd.Domain.Focus;

namespace Adhd.Application.Notifications;

// Sadece gösterim yazısı. Kaynağın uygunluğu, zamanı ve odak geçişi daha önce belirlenir.
public sealed record NotificationMessage(string Title, string Body);

public static class NotificationPresentation
{
    public static NotificationMessage Build(string kind, string? sourceName = null, bool beforeOccurrence = false,
        FocusState? focusState = null, bool breakStarted = false) => kind switch
    {
        "Custom" => new(Text(sourceName, "Hatırlatma"), "Hatırlatma"),
        "FocusTarget" => new("Pomodoro süresi doldu", focusState == FocusState.AwaitingNext
            ? "Yeni bir pomodoroya başlayabilirsin."
            : focusState == FocusState.Break && breakStarted ? "Molan başladı."
            : "Molaya geçebilir veya çalışmaya devam edebilirsin."),
        "BreakEnd" => new("Mola bitti", "Yeni bir pomodoroya başlayabilirsin."),
        "ScheduleStart" => new(beforeOccurrence ? "Planlı iş yaklaşıyor" : "Planlı iş başlıyor",
            Text(sourceName, "Planındaki işine göz atabilirsin.")),
        "ScheduleEnd" => new(beforeOccurrence ? "Planlı işin bitişi yaklaşıyor" : "Planlı işin bitiş zamanı geldi",
            Text(sourceName, "Planındaki işine göz atabilirsin.")),
        "TaskDeadline" => new(beforeOccurrence ? "Son teslim yaklaşıyor" : "Son teslim zamanı geldi",
            Text(sourceName, "Son teslimi olan görevine göz atabilirsin.")),
        "ReturnToTask" => new("İşe dönüş hatırlatması", Text(sourceName, "İşine kaldığın yerden devam edebilirsin.")),
        "SpecialDay" => new("Özel gün hatırlatması", Text(sourceName, "Özel günlerine göz atabilirsin.")),
        _ => new("Navortal", "Bir hatırlatmanız var."),
    };

    private static string Text(string? name, string fallback)
    {
        var value = name?.Trim();
        if (string.IsNullOrEmpty(value)) return fallback;
        if (value.Length <= 200) return value;
        var end = 200;
        if (char.IsHighSurrogate(value[end - 1]) && char.IsLowSurrogate(value[end])) end--;
        return value[..end];
    }
}
