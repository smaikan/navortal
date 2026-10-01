using Adhd.Domain.Focus;

namespace Adhd.Application.Focus;

public sealed record FocusPresetView(Guid Id, string Name, FocusSettings Settings, long Version);
public sealed record FocusPresetPage(FocusPresetView[] Items, int Offset, int Limit, int Total, FocusSettings[] BuiltIns);
public sealed record FocusStart(Guid? TaskId = null, Guid? WorkSessionId = null, long? WorkSessionVersion = null, Guid? PresetId = null, FocusSettings? Settings = null);
public sealed record FocusCommand(long Version, long WorkSessionVersion, bool SkipBreak = false);
public sealed record FocusView(Guid Id, Guid WorkSessionId, Guid? TaskId, Guid? PreviousFocusId, int CycleNumber, FocusState State,
    FocusSettings Settings, Guid? PresetId, string? PresetName, long? PresetVersion, DateTimeOffset StartedAt, DateTimeOffset? WorkEndedAt,
    DateTimeOffset? BreakStartedAt, DateTimeOffset? BreakEndedAt, DateTimeOffset? EndedAt, DateTimeOffset? TargetReachedAt, DateTimeOffset? TargetObservedAt,
    Guid? TargetEventId, decimal ActiveSeconds, decimal RemainingSeconds, decimal OvertimeSeconds, bool EffectiveTargetReached,
    int BreakTargetSeconds, decimal BreakElapsedSeconds, decimal BreakRemainingSeconds, long Version, long WorkSessionVersion, DateTimeOffset ServerNow);
public sealed record FocusCurrent(FocusView? Session, DateTimeOffset ServerNow);
public sealed record FocusPage(FocusView[] Items, int Offset, int Limit, int Total);
public sealed record FocusOutcome(FocusView Values, bool Replayed);
public interface IFocusStore
{
    Task<FocusOutcome> QuickStartAsync(Guid userId, FocusStart command, string key, CancellationToken ct);
    Task<FocusPresetPage> PresetsAsync(Guid userId, int offset, int limit, CancellationToken ct);
    Task<FocusPresetView> SavePresetAsync(Guid userId, Guid? id, string name, FocusSettings settings, long? version, CancellationToken ct);
    Task<FocusOutcome> StartFocusAsync(Guid userId, FocusStart command, string key, CancellationToken ct);
    Task<FocusOutcome> ChangeFocusAsync(Guid userId, Guid id, string action, FocusCommand command, string key, CancellationToken ct);
    Task<FocusCurrent> CurrentFocusAsync(Guid userId, CancellationToken ct);
    Task<FocusView> GetFocusAsync(Guid userId, Guid id, CancellationToken ct);
    Task<FocusPage> ListFocusAsync(Guid userId, int offset, int limit, CancellationToken ct);
}
public sealed class FocusService(IFocusStore store)
{
    public Task<FocusOutcome> QuickStartAsync(Guid userId, FocusStart command, string key, CancellationToken ct) => store.QuickStartAsync(userId, command, key, ct);
    public Task<FocusPresetPage> PresetsAsync(Guid userId, int offset, int limit, CancellationToken ct) => store.PresetsAsync(userId, offset, limit, ct);
    public Task<FocusPresetView> SavePresetAsync(Guid userId, Guid? id, string name, FocusSettings settings, long? version, CancellationToken ct) => store.SavePresetAsync(userId, id, name, settings, version, ct);
    public Task<FocusOutcome> StartAsync(Guid userId, FocusStart command, string key, CancellationToken ct) => store.StartFocusAsync(userId, command, key, ct);
    public Task<FocusOutcome> ChangeAsync(Guid userId, Guid id, string action, FocusCommand command, string key, CancellationToken ct) => store.ChangeFocusAsync(userId, id, action, command, key, ct);
    public Task<FocusCurrent> CurrentAsync(Guid userId, CancellationToken ct) => store.CurrentFocusAsync(userId, ct);
    public Task<FocusView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetFocusAsync(userId, id, ct);
    public Task<FocusPage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct) => store.ListFocusAsync(userId, offset, limit, ct);
}
