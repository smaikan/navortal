using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Planning;

// Saatsiz öğe gün listesinin görev bilgilerini taşır. Plan, gerçek çalışma ve görev bitirme ayrıdır. CompletedAt yalnız gün öğesini bitirir. Yazı ayrıca geri alma grubu ve üretilen plan sürümünü döndürür; okumada bunlar null. Bkz. CompletedAt
public sealed record DayItemView(Guid Id, DateOnly LocalDate, Guid TaskId, int SortOrder, DateTimeOffset? CompletedAt, long Version,
    string TaskTitle, Guid? ParentTaskId, string? ParentTitle, long? DirectEstimatedSeconds, TaskState TaskState, Guid? ChangeSetId = null, long? PlanningVersion = null,
    DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, bool IsUrgent = false, TaskPriority Priority = TaskPriority.Normal, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null, string? TimingIssue = null);
public sealed record DayItemPage(DayItemView[] Items, int Offset, int Limit, int Total);
public sealed record ScheduleCompletion(ScheduleView[] Schedules);
public enum DayItemAction { Complete, Reopen, Remove }
public enum DayItemPlacement { Last, First }
// Gün öğesinin geçmişte saklanan hali. Saatliye dönüşürse TimedScheduleId bağı var. Bkz. TimedScheduleId
public sealed record DayItemSnapshot(Guid Id, DateOnly LocalDate, Guid TaskId, int SortOrder, DayItemState State, DateTimeOffset? CompletedAt, long Version, Guid? TimedScheduleId = null,
    DateTimeOffset? StartsAt = null, DateTimeOffset? EndsAt = null, bool IsUrgent = false, string? TimingIssue = null);
public sealed record AddPlanEntry(Guid? TaskId, string? Title, long ExpectedPlanningVersion, bool IsUrgent = false,
    TaskPriority Priority = TaskPriority.Normal, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null);
public sealed record PlanEntryResult(DayItemView Item, bool Replayed = false);
public sealed record UpdateDayItemTime(long Version, long ExpectedPlanningVersion, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt);
// Birkaç gün öğesi birlikte taşıma veya geri alma için tek grupta değişir.
public sealed record DayItemBatchResult(Guid ChangeSetId, long PlanningVersion, DayItemView[] Items);
public sealed record DayItemMoveEntry(Guid Id, long Version);
