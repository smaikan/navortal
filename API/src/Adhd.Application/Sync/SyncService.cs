namespace Adhd.Application.Sync;

public sealed record SyncView(DateTimeOffset ServerNow, long PlanningVersion, Guid? WorkSessionId, Guid? FocusSessionId);
public interface ISyncStore { Task<SyncView> ReadAsync(Guid userId, CancellationToken ct); }
