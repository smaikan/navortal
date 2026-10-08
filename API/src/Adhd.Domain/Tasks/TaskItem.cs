namespace Adhd.Domain.Tasks;

public enum TaskState { Pending, InProgress, Paused, Completed, Deferred, Skipped, Canceled }
public enum TaskPriority { Low, Normal, High, Urgent }
public enum CompletionOrigin { Manual, Automatic }
public sealed class TaskItem
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? ProjectId { get; set; }
    public Guid? PoolId { get; set; }
    public Guid? CategoryId { get; set; }
    public Guid? ParentTaskId { get; set; }
    public decimal SortOrder { get; set; }
    public bool HasDirectWork { get; set; } = true;
    public bool DirectWorkCompleted { get; set; }
    public bool RequiredForParent { get; set; } = true;
    // Ayar kapalıysa bütün zorunlu çocuklar bitse de üst görevi kendiliğinden bitirme.
    public bool AutoCompleteFromChildren { get; set; } = true;
    public CompletionOrigin? CompletionOrigin { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public long? TargetBudgetSeconds { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public TaskState State { get; set; } = TaskState.Pending;
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public DateTimeOffset? DeadlineAt { get; set; }
    public bool CanSplit { get; set; } = true;
    public Adhd.Domain.Support.EnergyLevel? EnergyDemand { get; set; }
    public long? DirectEstimatedSeconds { get; set; }
    // Başlangıç ve bitiş birlikte dolu ya da boş. Bu yalnız gün önerisi, saatli bloğa engel olmaz.
    public DateOnly? PlannedFrom { get; set; }
    public DateOnly? PlannedTo { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    // Alt ağacı silerken ArchivedAt ile birlikte işaretle. Aynı grup geri gelince ikisini de temizle.
    public DateTimeOffset? DeletedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class TaskEvent
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid TaskId { get; set; }
    public string Type { get; set; } = "";
    public long Sequence { get; set; }
    public DateTimeOffset EffectiveAt { get; set; }
    public string? TimeZoneId { get; set; }
    public string Payload { get; set; } = "{}";
}
