using Adhd.Application.Calendar;
using Adhd.Application.Tasks;
using Adhd.Domain.Support;

namespace Adhd.Application.Support;

public interface ISupportPlanningCoordinator
{
    Task<Adhd.Application.Scheduling.SchedulingPlanOutcome> RescueAsync(Guid userId, Adhd.Application.Scheduling.SchedulingRequest request, string key, CancellationToken ct);
}

public sealed record NoteFields(NoteKind Kind, string Text, Guid? TaskId = null, Guid? WorkSessionId = null, DateOnly? LocalDate = null, DateTimeOffset? DueAt = null);
public sealed record NoteView(Guid Id, NoteKind Kind, string Text, Guid? TaskId, Guid? WorkSessionId, DateOnly? LocalDate, string TimeZoneId,
    DateTimeOffset? DueAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt, Guid? ConvertedTaskId, long Version);
public sealed record NotePage(NoteView[] Items, int Offset, int Limit, int Total);
public sealed record NoteConversion(long Version, string Title, Guid? PoolId = null, DateTimeOffset? DeadlineAt = null);
public sealed record ConvertedNote(Guid NoteId, Guid TaskId, long NoteVersion, long PlanningVersion, bool Replayed);
public sealed record SupportDayView(DateOnly LocalDate, string TimeZoneId, EnergyLevel? AvailableEnergy, Guid[] CriticalTaskIds, long Version, long PlanningVersion, bool Enabled);
public sealed record SupportDayChange(long Version, EnergyLevel? AvailableEnergy, Guid[] CriticalTaskIds);
public sealed record LastWorkContext(Guid WorkSessionId, Guid TaskId, Guid SegmentId, DateTimeOffset StartedAt, DateTimeOffset? EndedAt);
public sealed record LastCompletionContext(Guid TaskId, DateTimeOffset CompletedAt, long EventSequence);
public sealed record ReturnContext(Guid TaskId, long PlanningVersion, LastWorkContext? LastWork, NoteView? LastNote, NoteView? NextStepNote, LastCompletionContext? LastCompletion, TaskView? SuggestedStep, int OpenDirectTaskCount, DateTimeOffset ServerNow);
public sealed record DayEndCandidates(DateOnly LocalDate, TaskView[] Items, int Offset, int Limit, int Total, long PlanningVersion);
public sealed record DayEndPreparation(CalendarDayView Day, DayEndCandidates OpenWork, string[] AvailableActions);
public interface ISupportStore
{
    Task<NoteView> CreateNoteAsync(Guid userId, NoteFields fields, CancellationToken ct);
    Task<NoteView> ChangeNoteAsync(Guid userId, Guid id, long version, string? text, DateTimeOffset? dueAt, bool remove, CancellationToken ct);
    Task<NotePage> NotesAsync(Guid userId, Guid? taskId, NoteKind? kind, DateOnly? date, int offset, int limit, CancellationToken ct);
    Task<ConvertedNote> ConvertAsync(Guid userId, Guid id, NoteConversion command, string key, CancellationToken ct);
    Task<SupportDayView> DayAsync(Guid userId, DateOnly date, SupportDayChange? change, CancellationToken ct);
    Task<TaskView> EnergyAsync(Guid userId, Guid taskId, long version, EnergyLevel? energy, CancellationToken ct);
    Task<ReturnContext> ReturnAsync(Guid userId, Guid taskId, CancellationToken ct);
    Task<DayEndCandidates> CandidatesAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct);
}
public sealed class SupportService(ISupportStore store, CalendarService calendar)
{
    public Task<NoteView> CreateNoteAsync(Guid userId, NoteFields fields, CancellationToken ct) => store.CreateNoteAsync(userId, fields, ct);
    public Task<NoteView> ChangeNoteAsync(Guid userId, Guid id, long version, string? text, DateTimeOffset? dueAt, bool remove, CancellationToken ct) => store.ChangeNoteAsync(userId, id, version, text, dueAt, remove, ct);
    public Task<NotePage> NotesAsync(Guid userId, Guid? taskId, NoteKind? kind, DateOnly? date, int offset, int limit, CancellationToken ct) => store.NotesAsync(userId, taskId, kind, date, offset, limit, ct);
    public Task<ConvertedNote> ConvertAsync(Guid userId, Guid id, NoteConversion command, string key, CancellationToken ct) => store.ConvertAsync(userId, id, command, key, ct);
    public Task<SupportDayView> DayAsync(Guid userId, DateOnly date, SupportDayChange? change, CancellationToken ct) => store.DayAsync(userId, date, change, ct);
    public Task<TaskView> EnergyAsync(Guid userId, Guid taskId, long version, EnergyLevel? energy, CancellationToken ct) => store.EnergyAsync(userId, taskId, version, energy, ct);
    public Task<ReturnContext> ReturnAsync(Guid userId, Guid taskId, CancellationToken ct) => store.ReturnAsync(userId, taskId, ct);
    public async Task<DayEndPreparation> DayEndAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct)
    {
        var day = await calendar.DayAsync(userId, date, new(), ct); var candidates = await store.CandidatesAsync(userId, date, offset, limit, ct);
        if (day.Summary.PlanningVersion != candidates.PlanningVersion) throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Conflict, "planning_version_conflict", "Gün değişmiş; yeniden okuyun.");
        return new(day, candidates, ["Carry", "Move", "Pool", "Cancel"]);
    }
}
