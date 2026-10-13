namespace Adhd.Domain.Notifications;

public static class NotificationSounds
{
    public static bool Valid(string? sound) => sound is "bell" or "marimba" or "digital" or "glass" or "pulse" or "soft";
    public static string For(NotificationSettings settings, string kind) => kind switch
    {
        "FocusTarget" or "BreakEnd" => settings.PomodoroSound,
        "ScheduleEnd" => settings.TaskEndSound,
        _ => settings.ReminderSound
    };
}
