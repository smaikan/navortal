namespace Adhd.Domain.Planning;

public enum ScheduleKind { Work, Break, Buffer }
public enum ScheduleState { Planned, Removed }
public sealed class DailyPlan
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
    public string TimeZoneId { get; set; } = "Europe/Istanbul";
    public Guid? CurrentRevisionId { get; set; }
    public Guid? BaselineRevisionId { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class TaskSchedule
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DailyPlanId { get; set; }
    public Guid? TaskId { get; set; }
    public ScheduleKind Kind { get; set; }
    public ScheduleState State { get; set; } = ScheduleState.Planned;
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public bool IsFixed { get; set; }
    public bool IsLocked { get; set; }
    public bool IsAutomatic { get; set; }
    public Guid? SplitGroupId { get; set; }
    public Guid? OriginScheduleId { get; set; }
    public string? TaskSnapshot { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class PlanRevision
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid DailyPlanId { get; set; }
    public long Number { get; set; }
    public Guid? PreviousRevisionId { get; set; }
    public Guid ChangeSetId { get; set; }
    public Guid? ReversesChangeSetId { get; set; }
    public string Trigger { get; set; } = "Manual";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset EffectiveAt { get; set; }
    public string AlgorithmVersion { get; set; } = "manual-v1";
    public int SnapshotSchemaVersion { get; set; } = 1;
}
public sealed class PlanRevisionItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid RevisionId { get; set; }
    public Guid ScheduleId { get; set; }
    public string Snapshot { get; set; } = "{}";
}
// Plan değişikliği ya saatli ScheduleId ya da saatsiz DayItemId için yapılır.
public sealed class PlanRevisionChange
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid RevisionId { get; set; }
    public Guid? ScheduleId { get; set; }
    public Guid? DayItemId { get; set; }
    public string Type { get; set; } = "";
    public string? Before { get; set; }
    public string? After { get; set; }
    public bool ConflictsAccepted { get; set; }
}
// Revizyonun saatsiz öğeleri. Saatli bloklar PlanRevisionItem içinde kalır.
public sealed class PlanRevisionDayItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid RevisionId { get; set; }
    public Guid DayItemId { get; set; }
    public string Snapshot { get; set; } = "{}";
}
// Saatsiz iş kapasite, çakışma, motor veya hatırlatmaya
// girmez. Saat verilirse normal bloğa döner. Değişikliği
// sürümle geçmişe yaz ve geri alınabilir tut.
public enum DayItemState { Planned, Removed, Scheduled }
public sealed class DayItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
    public Guid TaskId { get; set; }
    public int SortOrder { get; set; }
    public DayItemState State { get; set; } = DayItemState.Planned;
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public long Version { get; set; } = 1;
    // Saat verilince açılan blok. Geçmişte aynı öğeyi bulmak için bu kimlik tutulur.
    public Guid? ScheduleId { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public bool IsUrgent { get; set; }
    public string? TimingIssue { get; set; }
}
