using Adhd.Domain.Work;

namespace Adhd.Domain.Focus;

public enum FocusState { Working, Paused, Break, AwaitingNext, Finished, Interrupted }
public enum FocusTargetBehavior { ContinueTracking, AutoBreak }
public sealed record FocusSettings(int WorkSeconds = 1500, int ShortBreakSeconds = 300, int LongBreakSeconds = 900,
    int LongBreakEvery = 4, FocusTargetBehavior TargetBehavior = FocusTargetBehavior.ContinueTracking, bool SoundEnabled = true, bool NotificationsEnabled = true);
public sealed class FocusPreset
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string Settings { get; set; } = "{}";
    public long Version { get; set; } = 1;
}
public sealed class FocusSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid WorkSessionId { get; set; }
    public Guid? PreviousFocusId { get; set; }
    public Guid? PresetId { get; set; }
    public string? PresetName { get; set; }
    public long? PresetVersion { get; set; }
    public string Settings { get; set; } = "{}";
    public int CycleNumber { get; set; } = 1;
    public FocusState State { get; set; } = FocusState.Working;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? WorkEndedAt { get; set; }
    public DateTimeOffset? BreakStartedAt { get; set; }
    public DateTimeOffset? BreakEndedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public DateTimeOffset? TargetReachedAt { get; set; }
    public DateTimeOffset? TargetObservedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed record FocusMeasurement(decimal ActiveSeconds, decimal RemainingSeconds, decimal OvertimeSeconds, DateTimeOffset? TargetInstant);
public static class FocusRules
{
    public static bool Valid(FocusSettings s) => s.WorkSeconds is >= 1 and <= 86400 && s.ShortBreakSeconds is >= 1 and <= 14400 &&
        s.LongBreakSeconds is >= 1 and <= 43200 && s.LongBreakEvery is >= 1 and <= 20 && Enum.IsDefined(s.TargetBehavior);
    public static int BreakSeconds(FocusSettings s, int cycle) => cycle % s.LongBreakEvery == 0 ? s.LongBreakSeconds : s.ShortBreakSeconds;
    public static FocusMeasurement Measure(FocusSession focus, FocusSettings settings, IEnumerable<WorkSessionSegment> segments, DateTimeOffset now)
    {
        var cutoff = focus.WorkEndedAt ?? now; decimal total = 0; DateTimeOffset? reached = null;
        foreach (var segment in segments.Where(x => !x.IsVoided).OrderBy(x => x.StartedAt).ThenBy(x => x.Id))
        {
            var end = segment.EndedAt ?? now;
            if (end < segment.StartedAt || end > now) throw new ArgumentOutOfRangeException(nameof(now));
            var a = segment.StartedAt > focus.StartedAt ? segment.StartedAt : focus.StartedAt; var b = end < cutoff ? end : cutoff;
            if (b <= a) continue;
            var seconds = WorkTime.Seconds(a, b);
            if (reached is null && total < settings.WorkSeconds && total + seconds >= settings.WorkSeconds)
                reached = a.AddTicks((long)((settings.WorkSeconds - total) * TimeSpan.TicksPerSecond));
            total += seconds;
        }
        return new(total, Math.Max(0, settings.WorkSeconds - total), Math.Max(0, total - settings.WorkSeconds), reached);
    }
}
