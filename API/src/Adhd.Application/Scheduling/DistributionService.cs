using System.Collections.Immutable;
using Adhd.Domain.Scheduling;

namespace Adhd.Application.Scheduling;

public sealed record DistributionRequest(DateOnly FromDate, DateOnly ToDate, Guid[] TaskIds, long? ExpectedPlanningVersion = null);
public sealed record DistributionDayView(DateOnly LocalDate, string TimeZoneId, ImmutableArray<SchedulingBlock> Blocks, ImmutableArray<ScheduleDifference> Changes,
    ImmutableArray<UnplacedWork> Unplaced, ImmutableArray<SchedulingMessage> Warnings, ImmutableArray<SchedulingMessage> Explanations);
public sealed record DistributionPreviewView(Guid ProposalId, long InputVersion, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt, string PlanningMode,
    string AlgorithmVersion, string Status, bool CanApply, bool HasConstraintConflicts, DistributionDayView[] Days, ImmutableArray<UnplacedWork> Unplaced,
    SchedulingApplyResult? Applied = null, Guid? ReversesChangeSetId = null, bool IsPartial = false);
public sealed record DistributionOutcome(DistributionPreviewView Values, bool Replayed);
public interface IDistributionCoordinator
{
    Task<DistributionPreviewView> PreviewDistributionAsync(Guid userId, DistributionRequest request, CancellationToken ct);
    Task<DistributionPreviewView> GetDistributionAsync(Guid userId, Guid id, CancellationToken ct);
    Task<SchedulingApplyOutcome> ApplyDistributionAsync(Guid userId, Guid id, string key, CancellationToken ct);
    Task<DistributionPreviewView> PreviewMultiUndoAsync(Guid userId, UndoRequest request, CancellationToken ct);
    Task<DistributionOutcome> PlanDistributionAsync(Guid userId, DistributionRequest request, string key, CancellationToken ct);
}
public sealed class DistributionService(IDistributionCoordinator coordinator)
{
    public Task<DistributionPreviewView> PreviewAsync(Guid userId, DistributionRequest request, CancellationToken ct) => coordinator.PreviewDistributionAsync(userId, request, ct);
    public Task<DistributionPreviewView> GetAsync(Guid userId, Guid id, CancellationToken ct) => coordinator.GetDistributionAsync(userId, id, ct);
    public Task<SchedulingApplyOutcome> ApplyAsync(Guid userId, Guid id, string key, CancellationToken ct) => coordinator.ApplyDistributionAsync(userId, id, key, ct);
    public Task<DistributionPreviewView> UndoAsync(Guid userId, UndoRequest request, CancellationToken ct) => coordinator.PreviewMultiUndoAsync(userId, request, ct);
    public Task<DistributionOutcome> PlanAsync(Guid userId, DistributionRequest request, string key, CancellationToken ct) => coordinator.PlanDistributionAsync(userId, request, key, ct);
}
