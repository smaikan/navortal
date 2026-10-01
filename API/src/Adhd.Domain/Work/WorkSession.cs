namespace Adhd.Domain.Work;

public enum WorkState { Running, Paused, Finished, Canceled }
public enum WorkSource { Timer, Manual }
public sealed class WorkSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? TaskId { get; set; }
    public Guid? StartedScheduleId { get; set; }
    public Guid? StartedRevisionItemId { get; set; }
    public WorkState State { get; set; } = WorkState.Running;
    public WorkSource Source { get; set; } = WorkSource.Timer;
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset RecordedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public string TimeZoneId { get; set; } = "Europe/Istanbul";
    public string? TaskSnapshot { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class WorkSessionSegment
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SessionId { get; set; }
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    public bool IsVoided { get; set; }
    public long Version { get; set; } = 1;
}
public static class WorkTime
{
    public static decimal Seconds(IEnumerable<WorkSessionSegment> segments, DateTimeOffset now) =>
        segments.Where(x => !x.IsVoided).Sum(x => Seconds(x.StartedAt, x.EndedAt ?? now));
    public static decimal Seconds(DateTimeOffset start, DateTimeOffset end) =>
        end < start ? throw new ArgumentOutOfRangeException(nameof(end)) : (end - start).Ticks / (decimal)TimeSpan.TicksPerSecond;
}
