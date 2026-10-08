using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Planning;

public sealed record PlanningTaskSnapshot(TaskAtStart Task, TaskState State, bool HasDirectWork, bool DirectWorkCompleted, bool RequiredForParent, long? DirectEstimatedSeconds, long? TargetBudgetSeconds);
public sealed record ScheduleView(Guid Id, Guid DailyPlanId, Guid? TaskId, ScheduleKind Kind, ScheduleState State,
    DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool IsFixed, bool IsLocked, Guid? SplitGroupId, Guid? OriginScheduleId, long Version, PlanningTaskSnapshot? TaskSnapshot, bool IsAutomatic = false, DateTimeOffset? CompletedAt = null);
public sealed record DailyPlanView(Guid? Id, DateOnly LocalDate, string TimeZoneId, Guid? CurrentRevisionId, Guid? BaselineRevisionId, long Version, long PlanningVersion);
public sealed record SchedulePage(ScheduleView[] Items, int Offset, int Limit, int Total);
public sealed record RevisionView(Guid Id, Guid DailyPlanId, long Number, Guid? PreviousRevisionId, Guid ChangeSetId, string Trigger, string Reason, DateTimeOffset CreatedAt, DateTimeOffset EffectiveAt, string AlgorithmVersion, int SnapshotSchemaVersion, Guid? ReversesChangeSetId = null);
public sealed record RevisionPage(RevisionView[] Items, int Offset, int Limit, int Total);
public sealed record RevisionItemView(Guid Id, Guid RevisionId, ScheduleView Schedule);
public sealed record RevisionItemPage(RevisionItemView[] Items, int Offset, int Limit, int Total);
public sealed record RevisionChangeView(Guid Id, Guid ScheduleId, string Type, ScheduleView? Before, ScheduleView? After, bool ConflictsAccepted);
public sealed record RevisionChangePage(RevisionChangeView[] Items, int Offset, int Limit, int Total);
public sealed record PlanningWarning(string Code, Guid[] ScheduleIds, decimal? Seconds = null);
public sealed record TaskAllocation(Guid TaskId, DateTimeOffset From, DateTimeOffset To, DateTimeOffset Cutoff, decimal DirectActualSeconds, decimal AllocatedSeconds, decimal? RemainingSeconds, decimal? UnallocatedSeconds, decimal? ExcessAllocatedSeconds);
public sealed record PlanMutation(Guid ChangeSetId, long PlanningVersion, ScheduleView[] Schedules, Guid[] RevisionIds, PlanningWarning[] Warnings);
public sealed record PlanMutationResult(PlanMutation Values, bool Replayed);
public sealed record CreateSchedule(DateOnly LocalDate, Guid? TaskId, ScheduleKind Kind, DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool IsFixed, bool IsLocked, bool AllowConflicts, long ExpectedPlanningVersion, string? Reason, Guid? DayItemId = null, long? DayItemVersion = null);
public sealed record UpdateSchedule(long Version, long ExpectedPlanningVersion, DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool IsFixed, bool IsLocked, bool AllowConflicts, bool AllowProtectedChange, string? Reason);
public sealed record MoveSchedule(long Version, long ExpectedPlanningVersion, DateOnly TargetDate, DateTimeOffset StartsAt, DateTimeOffset EndsAt, bool AllowConflicts, bool AllowProtectedChange, string? Reason);
public sealed record ReturnToPool(long Version, long ExpectedPlanningVersion, Guid PoolId, bool AllowProtectedChange, string? Reason);
public interface IPlanningStore
{
    Task<PlanMutationResult> ReturnToPoolAsync(Guid userId, DateOnly sourceDate, Guid taskId, ReturnToPool command, string key, CancellationToken ct);
    Task<DailyPlanView> DayAsync(Guid userId, DateOnly date, CancellationToken ct);
    Task<PlanMutationResult> CreateAsync(Guid userId, CreateSchedule command, string key, CancellationToken ct);
    Task<PlanMutationResult> ChangeAsync(Guid userId, Guid id, UpdateSchedule command, bool remove, string key, CancellationToken ct);
    Task<PlanMutationResult> MoveAsync(Guid userId, Guid id, MoveSchedule command, string key, CancellationToken ct);
    Task<ScheduleView> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<SchedulePage> ListAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, int offset, int limit, CancellationToken ct);
    Task<RevisionPage> RevisionsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct);
    Task<RevisionView> RevisionAsync(Guid userId, Guid id, CancellationToken ct);
    Task<RevisionItemPage> ItemsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct);
    Task<RevisionChangePage> ChangesAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct);
    Task<TaskAllocation> AllocationAsync(Guid userId, Guid taskId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct);
    Task<DayItemPage> DayItemsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct);
    Task<DayItemView> AddDayItemAsync(Guid userId, DateOnly date, Guid taskId, CancellationToken ct);
    Task<DayItemView> ChangeDayItemAsync(Guid userId, Guid id, long version, DayItemAction action, CancellationToken ct);
    Task<DayItemView> MoveDayItemAsync(Guid userId, Guid id, long version, DateOnly targetDate, CancellationToken ct);
    Task<ScheduleCompletion> CompleteScheduleAsync(Guid userId, Guid id, long version, bool complete, CancellationToken ct);
}
public sealed class PlanningService(IPlanningStore store)
{
    public Task<PlanMutationResult> ReturnToPoolAsync(Guid userId, DateOnly sourceDate, Guid taskId, ReturnToPool command, string key, CancellationToken ct) => store.ReturnToPoolAsync(userId, sourceDate, taskId, command, key, ct);
    public Task<DailyPlanView> DayAsync(Guid userId, DateOnly date, CancellationToken ct) => store.DayAsync(userId, date, ct);
    public Task<PlanMutationResult> CreateAsync(Guid userId, CreateSchedule command, string key, CancellationToken ct) => store.CreateAsync(userId, command, key, ct);
    public Task<PlanMutationResult> ChangeAsync(Guid userId, Guid id, UpdateSchedule command, bool remove, string key, CancellationToken ct) => store.ChangeAsync(userId, id, command, remove, key, ct);
    public Task<PlanMutationResult> MoveAsync(Guid userId, Guid id, MoveSchedule command, string key, CancellationToken ct) => store.MoveAsync(userId, id, command, key, ct);
    public Task<ScheduleView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetAsync(userId, id, ct);
    public Task<SchedulePage> ListAsync(Guid userId, DateTimeOffset from, DateTimeOffset to, int offset, int limit, CancellationToken ct) => store.ListAsync(userId, from, to, offset, limit, ct);
    public Task<RevisionPage> RevisionsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct) => store.RevisionsAsync(userId, date, offset, limit, ct);
    public Task<RevisionView> RevisionAsync(Guid userId, Guid id, CancellationToken ct) => store.RevisionAsync(userId, id, ct);
    public Task<RevisionItemPage> ItemsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct) => store.ItemsAsync(userId, id, offset, limit, ct);
    public Task<RevisionChangePage> ChangesAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct) => store.ChangesAsync(userId, id, offset, limit, ct);
    public Task<TaskAllocation> AllocationAsync(Guid userId, Guid taskId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct) => store.AllocationAsync(userId, taskId, from, to, ct);
    public Task<DayItemPage> DayItemsAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct) => store.DayItemsAsync(userId, date, offset, limit, ct);
    public Task<DayItemView> AddDayItemAsync(Guid userId, DateOnly date, Guid taskId, CancellationToken ct) => store.AddDayItemAsync(userId, date, taskId, ct);
    public Task<DayItemView> ChangeDayItemAsync(Guid userId, Guid id, long version, DayItemAction action, CancellationToken ct) => store.ChangeDayItemAsync(userId, id, version, action, ct);
    public Task<DayItemView> MoveDayItemAsync(Guid userId, Guid id, long version, DateOnly targetDate, CancellationToken ct) => store.MoveDayItemAsync(userId, id, version, targetDate, ct);
    public Task<ScheduleCompletion> CompleteScheduleAsync(Guid userId, Guid id, long version, bool complete, CancellationToken ct) => store.CompleteScheduleAsync(userId, id, version, complete, ct);
}
