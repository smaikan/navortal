using Adhd.Domain.Tasks;

namespace Adhd.Domain.Support;

public enum EnergyLevel { Low = 1, Medium = 2, High = 3 }
public enum NoteKind { Task, Distraction, NextStep, Daily }
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
