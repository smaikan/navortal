namespace Adhd.Domain.Jobs;

public enum OutboxState { Pending, Processing, Completed, Obsolete, Failed }
public sealed class OutboxMessage
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string EventKey { get; set; } = "";
    public string Kind { get; set; } = "";
    public Guid SourceId { get; set; }
    public long SourceVersion { get; set; }
    public string Payload { get; set; } = "{}";
    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset AvailableAt { get; set; }
    public OutboxState State { get; set; }
    public int Attempts { get; set; }
    public Guid? LeaseId { get; set; }
    public DateTimeOffset? LeaseUntil { get; set; }
    public string? LastErrorCode { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public long Version { get; set; } = 1;
}
public enum JobEffectState { Prepared, Completed, Obsolete }
public sealed class JobEffectReceipt
{
    public Guid OutboxId { get; set; }
    public Guid UserId { get; set; }
    public JobEffectState State { get; set; }
    public string? ResolvedInput { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
}
public enum ReminderKind { ScheduleStart, ScheduleEnd, TaskDeadline }
public enum ReminderState { Pending, Ready, Obsolete, Expired }
public sealed class ReminderWork
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string SourceKey { get; set; } = "";
    public ReminderKind Kind { get; set; }
    public Guid SourceId { get; set; }
    public long SourceVersion { get; set; }
    public Guid TaskId { get; set; }
    public Guid? DailyPlanId { get; set; }
    public Guid? RevisionId { get; set; }
    public DateTimeOffset DueAt { get; set; }
    public DateTimeOffset? SourceAt { get; set; }
    public ReminderState State { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? HandledAt { get; set; }
}
public enum NotificationIntentState { Pending, Obsolete, Ready, Suppressed, Expired }
public sealed class NotificationIntent
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string SourceKey { get; set; } = "";
    public string Kind { get; set; } = "";
    public Guid SourceId { get; set; }
    public long SourceVersion { get; set; }
    public Guid? TaskId { get; set; }
    public Guid? DailyPlanId { get; set; }
    public Guid? RevisionId { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public NotificationIntentState State { get; set; }
    public DateTimeOffset? NotBefore { get; set; }
    public DateTimeOffset? ReadyAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
    public int SnoozeCount { get; set; }
    public long Version { get; set; } = 1;
}
public static class JobRetry
{
    public const int MaxAttempts = 5;
    public static TimeSpan Delay(int attempt) => TimeSpan.FromSeconds(Math.Min(300, Math.Pow(2, Math.Clamp(attempt, 1, 8))));
}
