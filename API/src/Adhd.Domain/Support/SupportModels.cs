using Adhd.Domain.Tasks;

namespace Adhd.Domain.Support;

public enum EnergyLevel { Low = 1, Medium = 2, High = 3 }
public enum NoteKind { Task, Distraction, NextStep, Daily, General }
public enum NoteDisplay { Short, Detailed, Toggle }
public enum NoteCategoryColor { Gray, Blue, Teal, Green, Red, Pink, Purple }
public enum NoteViewMode { Cards, List }
public sealed class UserNote
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? TaskId { get; set; }
    public Guid? WorkSessionId { get; set; }
    public NoteKind Kind { get; set; }
    public string Text { get; set; } = "";
    public DateOnly? LocalDate { get; set; }
    public string TimeZoneId { get; set; } = "Europe/Istanbul";
    public DateTimeOffset? DueAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public Guid? ConvertedTaskId { get; set; }
    public string? ConversionHash { get; set; }
    public long Version { get; set; } = 1;
    public string? Title { get; set; }
    public Guid? CategoryId { get; set; }
    public NoteDisplay Display { get; set; }
}
// Not kategorisi hesaba ait. Kaldırınca seçicide gizlenir, not bağlantısı korunur ve geri yüklenebilir.
public sealed class NoteCategory
{
    public const string DefaultWarningName = "Uyarı";
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public NoteCategoryColor Color { get; set; }
    public decimal SortOrder { get; set; }
    public bool ShowInBar { get; set; } = true;
    public bool PinInAll { get; set; }
    public NoteViewMode ViewMode { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? RemovedAt { get; set; }
    public long Version { get; set; } = 1;
    public static NoteCategory DefaultWarning(Guid userId, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(), UserId = userId, Name = DefaultWarningName, Color = NoteCategoryColor.Red, SortOrder = 1024,
        ShowInBar = true, PinInAll = true, CreatedAt = now, UpdatedAt = now
    };
}
public sealed class SupportDay
{
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
    public string TimeZoneId { get; set; } = "Europe/Istanbul";
    public EnergyLevel? AvailableEnergy { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class DailyCriticalTask
{
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
    public Guid TaskId { get; set; }
    public int Slot { get; set; }
}
public static class SupportRules
{
    public static int EnergyPenalty(EnergyLevel? demand, EnergyLevel? available) => demand.HasValue && available.HasValue ? Math.Max(0, (int)demand.Value - (int)available.Value) : 0;
    public static bool Open(TaskItem task) => task.ArchivedAt is null && task.HasDirectWork && !task.DirectWorkCompleted && task.State is TaskState.Pending or TaskState.InProgress or TaskState.Paused;
}
