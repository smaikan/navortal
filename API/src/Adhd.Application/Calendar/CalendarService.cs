using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Calendar;

public sealed record CalendarDaySummary(DateOnly LocalDate, string TimeZoneId, Guid? DailyPlanId, Guid? CurrentRevisionId, Guid? BaselineRevisionId,
    long RevisionNumber, long PlanningVersion, decimal PlannedWorkSeconds, decimal PlannedBreakSeconds, decimal PlannedBufferSeconds,
    decimal BaselineWorkSeconds, int PlannedBlockCount, decimal ActualSeconds, int ActualSegmentCount, int CompletedTaskCount, bool HasOpenWork);
public sealed record CalendarRangeView(DateOnly FromDate, DateOnly ToDate, DateTimeOffset ServerNow, CalendarDaySummary[] Days, int LegacyZoneCompletionCount);
public sealed record HistoricalTaskState(Guid TaskId, TaskState? State, long? EventSequence, DateTimeOffset? EffectiveAt, bool Available);
public sealed record CalendarPlannedItem(Guid RevisionItemId, ScheduleView Schedule, HistoricalTaskState? TaskAtDayEnd);
public sealed record CalendarPlanPage(CalendarPlannedItem[] Items, int Offset, int Limit, int Total, Guid? RevisionId);
public sealed record CalendarActualItem(Guid SessionId, Guid SegmentId, Guid? TaskId, string TimeZoneId, DateTimeOffset StartsAt, DateTimeOffset EndsAt,
    DateTimeOffset SourceStartedAt, DateTimeOffset? SourceEndedAt, decimal ActiveSeconds, bool SessionStillRunning, TaskAtStart? TaskAtStart, HistoricalTaskState? TaskAtDayEnd);
public sealed record CalendarActualPage(CalendarActualItem[] Items, int Offset, int Limit, int Total);
public sealed record CalendarCompletionItem(Guid EventId, Guid TaskId, DateTimeOffset EffectiveAt, string TimeZoneId, string? Title, Guid? ParentTaskId, long Sequence);
public sealed record CalendarCompletionPage(CalendarCompletionItem[] Items, int Offset, int Limit, int Total);
public sealed record CalendarDayView(CalendarDaySummary Summary, DateTimeOffset ServerNow, CalendarPlanPage Plan, CalendarActualPage Actual, CalendarCompletionPage Completions, int LegacyZoneCompletionCount);
public sealed record CalendarDayQuery(Guid? RevisionId = null, int PlanOffset = 0, int PlanLimit = 50, int ActualOffset = 0, int ActualLimit = 50, int CompletionOffset = 0, int CompletionLimit = 50);
// Hafta ve ay grubu için saatli ya da saatsiz öğeyi görevi, üstü ve köküyle ver.
public enum CalendarItemKind { Timed, Untimed }
public sealed record CalendarItem(CalendarItemKind Kind, Guid Id, DateOnly LocalDate, Guid TaskId, string Title, Guid? ParentTaskId, string? ParentTitle,
    Guid RootTaskId, string RootTitle, DateTimeOffset? StartsAt, DateTimeOffset? EndsAt, DateTimeOffset? CompletedAt, TaskState TaskState);
public sealed record CalendarItemPage(DateOnly FromDate, DateOnly ToDate, CalendarItem[] Items, int Offset, int Limit, int Total);
public interface ICalendarStore
{
    Task<CalendarItemPage> ItemsAsync(Guid userId, DateOnly from, DateOnly to, int offset, int limit, CancellationToken ct);
    Task<CalendarRangeView> RangeAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<CalendarDayView> DayAsync(Guid userId, DateOnly date, CalendarDayQuery query, CancellationToken ct);
}
public sealed class CalendarService(ICalendarStore store)
{
    public Task<CalendarRangeView> RangeAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct) => store.RangeAsync(userId, from, to, ct);
    public Task<CalendarDayView> DayAsync(Guid userId, DateOnly date, CalendarDayQuery query, CancellationToken ct) => store.DayAsync(userId, date, query, ct);
    public Task<CalendarItemPage> ItemsAsync(Guid userId, DateOnly from, DateOnly to, int offset, int limit, CancellationToken ct) => store.ItemsAsync(userId, from, to, offset, limit, ct);
}
