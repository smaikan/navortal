using Adhd.Domain.Tasks;
using Adhd.Domain.Work;

namespace Adhd.Application.Work;

public sealed record NamedSnapshot(Guid Id, string Name);
public sealed record StartWork(Guid TaskId, Guid? ScheduleId = null, long? ScheduleVersion = null);
public sealed record TaskAtStart(int SchemaVersion, Guid TaskId, long TaskVersion, string Title,
    NamedSnapshot[] Ancestors, NamedSnapshot? Project, NamedSnapshot? Pool, NamedSnapshot? Category,
    NamedSnapshot[] Tags, long InputPlanningVersion, DateTimeOffset? CapturedAt = null);
public sealed record WorkView(Guid Id, Guid? TaskId, WorkState State, WorkSource Source,
    DateTimeOffset StartedAt, DateTimeOffset? EndedAt, string TimeZoneId, TaskAtStart? TaskAtStart,
    long Version, decimal ActiveSeconds, DateTimeOffset ServerNow, DateTimeOffset RecordedAt, Guid? StartedScheduleId = null, Guid? StartedRevisionItemId = null);
public sealed record WorkPage(WorkView[] Items, int Offset, int Limit, int Total);
public sealed record SegmentView(Guid Id, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, bool IsVoided, long Version);
public sealed record SegmentPage(SegmentView[] Items, int Offset, int Limit, int Total);
public sealed record CurrentWork(WorkView? ActiveSession, DateTimeOffset ServerNow, long PlanningVersion);
public sealed record StartWorkResult(WorkView Session, bool Replayed);
public sealed record TaskTimeView(Guid TaskId, decimal DirectActualSeconds, decimal SubtreeActualSeconds,
    decimal KnownRemainingSeconds, int UnknownRemainingCount, decimal? RemainingSeconds,
    decimal KnownOvertimeSeconds, int UnknownEstimateCount, DateTimeOffset ServerNow);
public interface IWorkStore
{
    Task<StartWorkResult> StartAsync(Guid userId, StartWork command, string key, CancellationToken ct);
    Task<WorkView> TransitionAsync(Guid userId, Guid id, long version, string action, CancellationToken ct);
    Task<WorkView> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<CurrentWork> CurrentAsync(Guid userId, CancellationToken ct);
    Task<WorkPage> ListAsync(Guid userId, int offset, int limit, WorkState? state, CancellationToken ct);
    Task<SegmentPage> SegmentsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct);
    Task<TaskTimeView> TaskTimeAsync(Guid userId, Guid taskId, CancellationToken ct);
}
public sealed class WorkService(IWorkStore store)
{
    public Task<StartWorkResult> StartAsync(Guid userId, StartWork command, string key, CancellationToken ct) => store.StartAsync(userId, command, key, ct);
    public Task<WorkView> TransitionAsync(Guid userId, Guid id, long version, string action, CancellationToken ct) => store.TransitionAsync(userId, id, version, action, ct);
    public Task<WorkView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetAsync(userId, id, ct);
    public Task<CurrentWork> CurrentAsync(Guid userId, CancellationToken ct) => store.CurrentAsync(userId, ct);
    public Task<WorkPage> ListAsync(Guid userId, int offset, int limit, WorkState? state, CancellationToken ct) => store.ListAsync(userId, offset, limit, state, ct);
    public Task<SegmentPage> SegmentsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct) => store.SegmentsAsync(userId, id, offset, limit, ct);
    public Task<TaskTimeView> TaskTimeAsync(Guid userId, Guid taskId, CancellationToken ct) => store.TaskTimeAsync(userId, taskId, ct);
}
