using Adhd.Domain.Work;

namespace Adhd.Application.Work;

public sealed record ManualWork(Guid TaskId, DateTimeOffset StartedAt, DateTimeOffset EndedAt, string Reason);
public sealed record CorrectWork(long Version, long SegmentVersion, DateTimeOffset StartedAt, DateTimeOffset? EndedAt, bool IsVoided, string Reason);
public sealed record SessionAudit(DateTimeOffset StartedAt, DateTimeOffset? EndedAt, WorkState State, long Version);
public sealed record CorrectionView(Guid Id, Guid SessionId, Guid SegmentId, long Sequence, string Kind, string Reason,
    DateTimeOffset CreatedAt, SegmentView? PreviousValues, SegmentView NewValues, SessionAudit? PreviousSession, SessionAudit NewSession);
public sealed record CorrectionPage(CorrectionView[] Items, int Offset, int Limit, int Total);
public interface IWorkCorrectionStore
{
    Task<StartWorkResult> ManualAsync(Guid userId, ManualWork command, string key, CancellationToken ct);
    Task<WorkView> CorrectAsync(Guid userId, Guid sessionId, Guid segmentId, CorrectWork command, CancellationToken ct);
    Task<CorrectionPage> CorrectionsAsync(Guid userId, Guid sessionId, int offset, int limit, CancellationToken ct);
}
public sealed class WorkCorrectionService(IWorkCorrectionStore store)
{
    public Task<StartWorkResult> ManualAsync(Guid userId, ManualWork command, string key, CancellationToken ct) => store.ManualAsync(userId, command, key, ct);
    public Task<WorkView> CorrectAsync(Guid userId, Guid sessionId, Guid segmentId, CorrectWork command, CancellationToken ct) => store.CorrectAsync(userId, sessionId, segmentId, command, ct);
    public Task<CorrectionPage> CorrectionsAsync(Guid userId, Guid sessionId, int offset, int limit, CancellationToken ct) => store.CorrectionsAsync(userId, sessionId, offset, limit, ct);
}
