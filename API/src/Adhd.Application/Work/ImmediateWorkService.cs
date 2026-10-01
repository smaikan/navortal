using Adhd.Application.Scheduling;

namespace Adhd.Application.Work;

public sealed record StartNowCommand(Guid TaskId, long ExpectedPlanningVersion, Guid? ExpectedSessionId = null, long? ExpectedSessionVersion = null, Guid[]? RemainingTaskIds = null);
public sealed record ImmediateWorkReceipt(WorkView Session, WorkView? PausedSession, DateOnly LocalDate, long PlanningVersion, Guid[] TaskIds, bool Resumed);
public sealed record ImmediateWorkStart(ImmediateWorkReceipt Values, bool Replayed);
public sealed record ImmediateWorkResult(ImmediateWorkReceipt Work, SchedulingPreviewView? Plan, string PlanningStatus, string? PlanningError, bool Replayed);
public interface IImmediateWorkStore { Task<ImmediateWorkStart> StartNowAsync(Guid userId, StartNowCommand command, string key, CancellationToken ct); }
public interface IImmediateWorkCoordinator { Task<ImmediateWorkResult> StartNowAsync(Guid userId, StartNowCommand command, string key, CancellationToken ct); }
public sealed class ImmediateWorkService(IImmediateWorkCoordinator coordinator)
{
    public Task<ImmediateWorkResult> StartNowAsync(Guid userId, StartNowCommand command, string key, CancellationToken ct) => coordinator.StartNowAsync(userId, command, key, ct);
}
