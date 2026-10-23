using Adhd.Domain.Recurrence;
using Adhd.Domain.Support;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Recurrence;

public sealed record RecurringTaskDefaults(string Title, string? Description = null, long? EstimatedSeconds = null, TaskPriority Priority = TaskPriority.Normal, bool CanSplit = true, Guid? PoolId = null, EnergyLevel? EnergyDemand = null);
public sealed record RecurrenceCreate(RecurrenceRule Rule, RecurringTaskDefaults Task);
public sealed record RecurrenceUpdate(long Version, DateOnly EffectiveFrom, RecurrenceRule Rule, RecurringTaskDefaults Task, bool RefreshExisting = false, DateOnly? RefreshThrough = null);
public sealed record RecurrenceTemplateView(Guid Id, bool Enabled, long Version, Guid DefinitionId, long DefinitionNumber, DateOnly EffectiveFrom, RecurrenceRule Rule, RecurringTaskDefaults Task, DateTimeOffset CreatedAt);
public sealed record RecurrenceTemplatePage(RecurrenceTemplateView[] Items, int Offset, int Limit, int Total);
public sealed record RecurrenceDefinitionView(Guid Id, long Number, DateOnly EffectiveFrom, RecurrenceRule Rule, RecurringTaskDefaults Task, DateTimeOffset CreatedAt);
public sealed record RecurrenceDefinitionPage(RecurrenceDefinitionView[] Items, int Offset, int Limit, int Total);
public sealed record OccurrenceView(Guid Id, Guid TemplateId, Guid OriginalDefinitionId, Guid AppliedDefinitionId, DateOnly LocalDate, string OriginalTimeZoneId, TimeOnly? OriginalDueTime, DateTimeOffset? OriginalDueAt,
    bool TimeAdjusted, Guid? TaskId, TaskState? TaskState, long? TaskVersion, bool TaskChangedSinceSync, OccurrenceState State, string? Reason);
public sealed record OccurrencePage(OccurrenceView[] Items, int Offset, int Limit, int Total);
public sealed record RecurrenceEffect(RecurrenceTemplateView Template, OccurrenceView[] Occurrences, Guid[] RefreshedTaskIds, Guid[] ProtectedTaskIds, long PlanningVersion, bool Replayed = false, int RetractedDayItemCount = 0);
public sealed record RecurrenceProjectionItem(Guid TemplateId, long TemplateVersion, DateOnly LocalDate, string Title, TimeOnly? StartTime, long? EstimatedSeconds);
public sealed record RecurrenceProjectionView(DateOnly FromDate, DateOnly ToDate, RecurrenceProjectionItem[] Items);
public sealed record MaterializeRecurrence(long Version, DateOnly FromDate, DateOnly ToDate);
public sealed record ChangeOccurrence(long Version, long? TaskVersion = null);
public interface IRecurrenceStore
{
    Task<RecurrenceDefinitionPage> DefinitionsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct);
    Task<RecurrenceTemplateView> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<RecurrenceTemplatePage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct);
    Task<RecurrenceEffect> CreateAsync(Guid userId, RecurrenceCreate command, string key, CancellationToken ct);
    Task<RecurrenceEffect> UpdateAsync(Guid userId, Guid id, RecurrenceUpdate command, string key, CancellationToken ct);
    Task<RecurrenceEffect> EnableAsync(Guid userId, Guid id, long version, bool enabled, string key, CancellationToken ct);
    Task<RecurrenceEffect> MaterializeAsync(Guid userId, Guid id, MaterializeRecurrence command, string key, CancellationToken ct);
    Task<RecurrenceEffect> ChangeOccurrenceAsync(Guid userId, Guid id, DateOnly date, ChangeOccurrence command, bool cancel, string key, CancellationToken ct);
    Task<OccurrencePage> OccurrencesAsync(Guid userId, Guid id, DateOnly from, DateOnly to, int offset, int limit, CancellationToken ct);
    Task<OccurrenceView> ForTaskAsync(Guid userId, Guid taskId, CancellationToken ct);
    Task<RecurrenceProjectionView> ProjectionAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct);
}
public sealed class RecurrenceService(IRecurrenceStore store)
{
    public Task<RecurrenceDefinitionPage> DefinitionsAsync(Guid userId, Guid id, int offset, int limit, CancellationToken ct) => store.DefinitionsAsync(userId, id, offset, limit, ct);
    public Task<RecurrenceTemplateView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetAsync(userId, id, ct);
    public Task<RecurrenceTemplatePage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct) => store.ListAsync(userId, offset, limit, ct);
    public Task<RecurrenceEffect> CreateAsync(Guid userId, RecurrenceCreate command, string key, CancellationToken ct) => store.CreateAsync(userId, command, key, ct);
    public Task<RecurrenceEffect> UpdateAsync(Guid userId, Guid id, RecurrenceUpdate command, string key, CancellationToken ct) => store.UpdateAsync(userId, id, command, key, ct);
    public Task<RecurrenceEffect> EnableAsync(Guid userId, Guid id, long version, bool enabled, string key, CancellationToken ct) => store.EnableAsync(userId, id, version, enabled, key, ct);
    public Task<RecurrenceEffect> MaterializeAsync(Guid userId, Guid id, MaterializeRecurrence command, string key, CancellationToken ct) => store.MaterializeAsync(userId, id, command, key, ct);
    public Task<RecurrenceEffect> ChangeOccurrenceAsync(Guid userId, Guid id, DateOnly date, ChangeOccurrence command, bool cancel, string key, CancellationToken ct) => store.ChangeOccurrenceAsync(userId, id, date, command, cancel, key, ct);
    public Task<OccurrencePage> OccurrencesAsync(Guid userId, Guid id, DateOnly from, DateOnly to, int offset, int limit, CancellationToken ct) => store.OccurrencesAsync(userId, id, from, to, offset, limit, ct);
    public Task<OccurrenceView> ForTaskAsync(Guid userId, Guid taskId, CancellationToken ct) => store.ForTaskAsync(userId, taskId, ct);
    public Task<RecurrenceProjectionView> ProjectionAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct) => store.ProjectionAsync(userId, from, to, ct);
}
