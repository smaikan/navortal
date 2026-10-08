using Adhd.Domain.Tasks;

namespace Adhd.Application.Planning;

// Saatsiz öğe görev bilgilerini taşır. CompletedAt
// yalnızca plan öğesini bitirir, görevi kapatmaz.
public sealed record DayItemView(Guid Id, DateOnly LocalDate, Guid TaskId, int SortOrder, DateTimeOffset? CompletedAt, long Version,
    string TaskTitle, Guid? ParentTaskId, string? ParentTitle, long? DirectEstimatedSeconds, TaskState TaskState);
public sealed record DayItemPage(DayItemView[] Items, int Offset, int Limit, int Total);
public sealed record ScheduleCompletion(ScheduleView[] Schedules);
public enum DayItemAction { Complete, Reopen, Remove }
