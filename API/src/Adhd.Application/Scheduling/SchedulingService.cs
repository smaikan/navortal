using System.Collections.Immutable;
using Adhd.Application.Planning;
using Adhd.Domain.Scheduling;

namespace Adhd.Application.Scheduling;

public sealed record SchedulingRequest(DateOnly Date, Guid[] TaskIds, long? ExpectedPlanningVersion = null, DateTimeOffset? NewWorkNotBefore = null);
public sealed record UndoRequest(Guid ChangeSetId, long? ExpectedPlanningVersion = null, bool AllowProtectedChange = false);
public sealed record ScheduleDifference(string Type, Guid? ScheduleId, Guid? TaskId, ScheduleView? Before, SchedulingBlock? After);
public sealed record SchedulingApplyResult(Guid ProposalId, Guid? ChangeSetId, long PlanningVersion, Guid[] RevisionIds, bool NoChanges);
public sealed record SchedulingPreviewView(Guid ProposalId, long InputVersion, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt,
    DateTimeOffset AnchorAt, string PlanningMode, string AlgorithmVersion, bool HasConstraintConflicts, bool CanApply, string Status,
    ImmutableArray<SchedulingBlock> Blocks, ImmutableArray<ScheduleDifference> Changes, ImmutableArray<UnplacedWork> Unplaced,
    ImmutableArray<SchedulingMessage> Warnings, ImmutableArray<SchedulingMessage> Explanations, SchedulingApplyResult? Applied = null, Guid? ReversesChangeSetId = null, bool IsPartial = false);
public sealed record SchedulingApplyOutcome(SchedulingApplyResult Values, bool Replayed);
public sealed record SchedulingPlanOutcome(SchedulingPreviewView Values, bool Replayed);
public interface ISchedulingCoordinator
{
    Task<SchedulingPreviewView> PreviewAsync(Guid userId, SchedulingRequest request, CancellationToken ct);
    Task<SchedulingPreviewView> GetAsync(Guid userId, Guid proposalId, CancellationToken ct);
    Task<SchedulingApplyOutcome> ApplyAsync(Guid userId, Guid proposalId, string key, CancellationToken ct);
    Task<SchedulingPlanOutcome> PlanAsync(Guid userId, SchedulingRequest request, string key, CancellationToken ct);
    Task<SchedulingPreviewView> PreviewUndoAsync(Guid userId, UndoRequest request, CancellationToken ct);
}
public sealed class SchedulingService(ISchedulingCoordinator coordinator)
{
    public Task<SchedulingPreviewView> PreviewAsync(Guid userId, SchedulingRequest request, CancellationToken ct) => coordinator.PreviewAsync(userId, request, ct);
    public Task<SchedulingPreviewView> GetAsync(Guid userId, Guid id, CancellationToken ct) => coordinator.GetAsync(userId, id, ct);
    public Task<SchedulingApplyOutcome> ApplyAsync(Guid userId, Guid id, string key, CancellationToken ct) => coordinator.ApplyAsync(userId, id, key, ct);
    public Task<SchedulingPlanOutcome> PlanAsync(Guid userId, SchedulingRequest request, string key, CancellationToken ct) => coordinator.PlanAsync(userId, request, key, ct);
    public Task<SchedulingPreviewView> PreviewUndoAsync(Guid userId, UndoRequest request, CancellationToken ct) => coordinator.PreviewUndoAsync(userId, request, ct);
}
