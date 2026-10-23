namespace Adhd.Domain.Recurrence;

public sealed class RecurrenceTemplate
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public bool Enabled { get; set; } = true;
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
public sealed class RecurrenceDefinition
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid TemplateId { get; set; }
    public long Number { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public string Rule { get; set; } = "{}";
    public string TaskDefaults { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
public enum OccurrenceState { Materialized, Skipped, Canceled }
// Sistem kararıyla kapanan oluşum nedenleri. Seri geri açılır veya uzarsa bu oluşumlar aynı görevle döner; kullanıcı işaretleri dönmez.
public static class OccurrenceReason
{
    public const string User = "User", SeriesPaused = "SeriesPaused", SeriesChanged = "SeriesChanged";
    public static bool Revivable(OccurrenceState state, string? reason, Guid? taskId) => state == OccurrenceState.Skipped && taskId.HasValue && reason is SeriesPaused or SeriesChanged;
}
public sealed class RecurrenceOccurrence
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid TemplateId { get; set; }
    public Guid DefinitionId { get; set; }
    public Guid AppliedDefinitionId { get; set; }
    public DateOnly LocalDate { get; set; }
    public string TimeZoneId { get; set; } = "Europe/Istanbul";
    public TimeOnly? DueTime { get; set; }
    public DateTimeOffset? DueAt { get; set; }
    public bool TimeAdjusted { get; set; }
    public Guid? TaskId { get; set; }
    public long? SyncedTaskVersion { get; set; }
    public OccurrenceState State { get; set; }
    public string? Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
