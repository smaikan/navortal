using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Planning;

// CompletedAt yalnız plan öğesini bitirir. Yazıda
// geri alma grubu ve yeni plan
// sürümü döner, okumada ikisi null.
public sealed record DayItemView(Guid Id, DateOnly LocalDate, Guid TaskId, int SortOrder, DateTimeOffset? CompletedAt, long Version,
    string TaskTitle, Guid? ParentTaskId, string? ParentTitle, long? DirectEstimatedSeconds, TaskState TaskState, Guid? ChangeSetId = null, long? PlanningVersion = null,
    DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, bool IsUrgent = false, TaskPriority Priority = TaskPriority.Normal, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null, string? TimingIssue = null);
public sealed record DayItemPage(DayItemView[] Items, int Offset, int Limit, int Total);
public sealed record ScheduleCompletion(ScheduleView[] Schedules);
public enum DayItemAction { Complete, Reopen, Remove }
public enum DayItemPlacement { Last, First }
// Gün öğesinin geçmişteki hali. Saatliye çevrildiyse TimedScheduleId ile bağlı.
public sealed record DayItemSnapshot(Guid Id, DateOnly LocalDate, Guid TaskId, int SortOrder, DayItemState State, DateTimeOffset? CompletedAt, long Version, Guid? TimedScheduleId = null,
    DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, bool IsUrgent = false, string? TimingIssue = null);
public sealed record AddPlanEntry(Guid? TaskId, string? Title, long ExpectedPlanningVersion, bool IsUrgent = false,
    TaskPriority Priority = TaskPriority.Normal, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null);
public sealed record PlanEntryResult(DayItemView Item, bool Replayed = false);
public sealed record UpdateDayItemTime(long Version, long ExpectedPlanningVersion, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt);
// Beraber taşınan ya da geri alınan gün öğeleri tek grupta.
public sealed record DayItemBatchResult(Guid ChangeSetId, long PlanningVersion, DayItemView[] Items);
public sealed record DayItemMoveEntry(Guid Id, long Version);
