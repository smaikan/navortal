using Adhd.Domain.Jobs;

namespace Adhd.Application.Jobs;

public sealed record OutboxClaim(Guid Id, Guid UserId, string Kind, Guid SourceId, long SourceVersion, string Payload, Guid LeaseId, DateTimeOffset LeaseUntil, int Attempts);
public sealed record OutboxView(Guid Id, string Kind, Guid SourceId, long SourceVersion, OutboxState State, int Attempts, DateTimeOffset OccurredAt, DateTimeOffset AvailableAt, DateTimeOffset? LeaseUntil, string? LastErrorCode, DateTimeOffset? CompletedAt, long Version);
public sealed record OutboxPage(OutboxView[] Items, int Offset, int Limit, int Total);
public sealed record ReminderView(Guid Id, ReminderKind Kind, Guid SourceId, Guid TaskId, Guid? DailyPlanId, Guid? RevisionId, DateTimeOffset DueAt, ReminderState State, DateTimeOffset? HandledAt);
public sealed record ReminderPage(ReminderView[] Items, int Offset, int Limit, int Total);
public interface IOutboxStore
{
    Task<OutboxClaim[]> ClaimAsync(int limit, CancellationToken ct);
    Task CompleteAsync(OutboxClaim claim, bool obsolete, CancellationToken ct);
    Task FailAsync(OutboxClaim claim, string code, CancellationToken ct);
    Task DeferAsync(OutboxClaim claim, DateTimeOffset until, bool countAttempt, CancellationToken ct);
    Task<OutboxPage> ListAsync(Guid userId, OutboxState? state, int offset, int limit, CancellationToken ct);
    Task<OutboxView> RetryAsync(Guid userId, Guid id, long version, CancellationToken ct);
    Task<ReminderPage> RemindersAsync(Guid userId, ReminderState? state, int offset, int limit, CancellationToken ct);
}
public interface IOutboxHandler { Task<bool> HandleAsync(OutboxClaim claim, CancellationToken ct); }
public interface IOutboxDispatcher { Task<int> RunOnceAsync(int limit, CancellationToken ct); }
public interface IReminderDispatcher { Task<int> RunOnceAsync(int limit, CancellationToken ct); }
public interface IRealtimePublisher { Task PublishAsync(OutboxClaim claim, CancellationToken ct); }
public sealed class JobService(IOutboxStore store)
{
    public Task<OutboxPage> ListAsync(Guid userId, OutboxState? state, int offset, int limit, CancellationToken ct) => store.ListAsync(userId, state, offset, limit, ct);
    public Task<OutboxView> RetryAsync(Guid userId, Guid id, long version, CancellationToken ct) => store.RetryAsync(userId, id, version, ct);
    public Task<ReminderPage> RemindersAsync(Guid userId, ReminderState? state, int offset, int limit, CancellationToken ct) => store.RemindersAsync(userId, state, offset, limit, ct);
}
