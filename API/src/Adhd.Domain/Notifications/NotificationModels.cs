namespace Adhd.Domain.Notifications;

public sealed record NotificationSettings(bool Enabled = true, bool PushEnabled = false, bool SoundEnabled = true,
    bool ScheduleStart = true, bool ScheduleEnd = true, bool TaskDeadline = true, bool FocusTarget = true,
    bool BreakEnd = true, bool ReturnToTask = true, bool Custom = true, int LeadSeconds = 0,
    int SnoozeSeconds = 300, TimeOnly? QuietStart = null, TimeOnly? QuietEnd = null, int ReturnAfterSeconds = 0, bool SpecialDay = true,
    string PomodoroSound = "bell", string ReminderSound = "marimba", string TaskEndSound = "digital");
public sealed class NotificationPreferences
{
    public Guid UserId { get; set; }
    public string Settings { get; set; } = "{}";
    public long Version { get; set; } = 1;
}
public sealed class PushSubscriptionRecord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Endpoint { get; set; } = "";
    public string EndpointHash { get; set; } = "";
    public string P256dh { get; set; } = "";
    public string Auth { get; set; } = "";
    public string Label { get; set; } = "";
    public bool Active { get; set; } = true;
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public long Version { get; set; } = 1;
}
public enum DeliveryState { Pending, Succeeded, Obsolete, InvalidSubscription, Rejected }
public sealed class PushDelivery
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid NotificationId { get; set; }
    public Guid SubscriptionId { get; set; }
    public int SnoozeCount { get; set; }
    public DeliveryState State { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public int? LastStatusCode { get; set; }
}
public sealed class CustomReminder
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? TaskId { get; set; }
    public string Title { get; set; } = "";
    public string? RepeatSettings { get; set; }
    public DateTimeOffset? NextDueAt { get; set; }
    public DateTimeOffset DueAt { get; set; }
    public bool Canceled { get; set; }
    public long Version { get; set; } = 1;
}
public static class NotificationPolicy
{
    public static bool Valid(NotificationSettings s) => s.LeadSeconds is >= 0 and <= 86400 && s.SnoozeSeconds is >= 60 and <= 86400 && s.ReturnAfterSeconds is >= 0 and <= 86400 &&
        NotificationSounds.Valid(s.PomodoroSound) && NotificationSounds.Valid(s.ReminderSound) && NotificationSounds.Valid(s.TaskEndSound) &&
        s.QuietStart.HasValue == s.QuietEnd.HasValue && (!s.QuietStart.HasValue || s.QuietStart != s.QuietEnd);
    public static bool Allows(NotificationSettings s, string kind) => s.Enabled && kind switch
    {
        "ScheduleStart" => s.ScheduleStart, "ScheduleEnd" => s.ScheduleEnd, "TaskDeadline" => s.TaskDeadline,
        "FocusTarget" => s.FocusTarget, "BreakEnd" => s.BreakEnd, "ReturnToTask" => s.ReturnToTask, "Custom" => s.Custom, "SpecialDay" => s.SpecialDay, _ => false
    };
    public static DateTimeOffset? QuietUntil(NotificationSettings s, string zoneId, DateTimeOffset now)
    {
        if (s.QuietStart is not { } start || s.QuietEnd is not { } end) return null;
        var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId); var local = TimeZoneInfo.ConvertTime(now, zone); var time = TimeOnly.FromDateTime(local.DateTime);
        var inside = start < end ? time >= start && time < end : time >= start || time < end;
        if (!inside) return null;
        var date = DateOnly.FromDateTime(local.DateTime); if (start > end && time >= start) date = date.AddDays(1);
        var wall = date.ToDateTime(end, DateTimeKind.Unspecified);
        // Sessiz saat bitişi yaz saati geçişinde yoksa sonraki geçerli dakikayı al. İki kez olursa geç olanı seç
        for (var i = 0; zone.IsInvalidTime(wall) && i < 180; i++) wall = wall.AddMinutes(1);
        var offset = zone.IsAmbiguousTime(wall) ? zone.GetAmbiguousTimeOffsets(wall).Min() : zone.GetUtcOffset(wall);
        return new DateTimeOffset(wall, offset).ToUniversalTime();
    }
}
