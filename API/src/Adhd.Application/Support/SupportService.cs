using Adhd.Application.Calendar;
using Adhd.Application.Tasks;
using Adhd.Domain.Support;

namespace Adhd.Application.Support;

public interface ISupportPlanningCoordinator
{
    Task<Adhd.Application.Scheduling.SchedulingPlanOutcome> RescueAsync(Guid userId, Adhd.Application.Scheduling.SchedulingRequest request, string key, CancellationToken ct);
}

public sealed record NoteFields(NoteKind Kind, string Text, Guid? TaskId = null, Guid? WorkSessionId = null, DateOnly? LocalDate = null, DateTimeOffset? DueAt = null,
    string? Title = null, Guid? CategoryId = null, NoteDisplay Display = NoteDisplay.Short);
public sealed record NoteView(Guid Id, NoteKind Kind, string Text, Guid? TaskId, Guid? WorkSessionId, DateOnly? LocalDate, string TimeZoneId,
    DateTimeOffset? DueAt, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt, Guid? ConvertedTaskId, long Version,
    string? Title, Guid? CategoryId, NoteDisplay Display, string? TaskTitle);
public sealed record NotePage(NoteView[] Items, int Offset, int Limit, int Total);
// Görünüm null ise başlık/kategori/görünüm korunur, yalnız metin/tarih değişebilir. Diğer değerler üçünü de değiştirir.
public sealed record NoteEdit(long Version, string Text, DateTimeOffset? DueAt, NoteDisplay? Display = null, string? Title = null, Guid? CategoryId = null);
public sealed record NoteQuery(Guid? TaskId = null, NoteKind? Kind = null, DateOnly? Date = null, Guid? CategoryId = null, bool TaskLinked = false,
    bool ExcludePinned = false, string? Search = null, int Offset = 0, int Limit = 50);
public sealed record NoteCategoryView(Guid Id, string Name, NoteCategoryColor Color, bool ShowInBar, bool PinInAll, NoteViewMode ViewMode,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? RemovedAt, long Version);
public sealed record NoteCategoryList(NoteCategoryView[] Items, NoteViewMode AllViewMode, NoteViewMode TaskViewMode, long NotesVersion);
public sealed record NoteCategoryFields(string Name, NoteCategoryColor Color, bool ShowInBar = true, bool PinInAll = false);
public sealed record NoteCategoryChange(long Version, string Name, NoteCategoryColor Color, bool ShowInBar, bool PinInAll, NoteViewMode ViewMode);
public sealed record NoteCategoryMove(long Version, Guid? BeforeCategoryId);
public sealed record NoteSystemViews(NoteViewMode AllViewMode, NoteViewMode TaskViewMode);
public sealed record NoteConversion(long Version, string Title, Guid? PoolId = null, DateTimeOffset? DeadlineAt = null,
    DateOnly? PlannedFrom = null, DateOnly? PlannedTo = null, EnergyLevel? EnergyDemand = null,
    Adhd.Domain.Tasks.TaskPriority? Priority = null, bool InheritNoteDueAt = true);
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
    Task<NoteView> EditNoteAsync(Guid userId, Guid id, NoteEdit edit, CancellationToken ct);
    Task<NoteView> RemoveNoteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct);
    Task<NotePage> NotesAsync(Guid userId, NoteQuery query, CancellationToken ct);
    Task<NoteCategoryList> CategoriesAsync(Guid userId, CancellationToken ct);
    Task<NoteCategoryView> CreateCategoryAsync(Guid userId, NoteCategoryFields fields, CancellationToken ct);
    Task<NoteCategoryView> ChangeCategoryAsync(Guid userId, Guid id, NoteCategoryChange change, CancellationToken ct);
    Task<NoteCategoryView> MoveCategoryAsync(Guid userId, Guid id, NoteCategoryMove move, CancellationToken ct);
    Task<NoteCategoryView> RemoveCategoryAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct);
    Task<NoteSystemViews> SystemViewsAsync(Guid userId, NoteSystemViews views, CancellationToken ct);
    Task<ConvertedNote> ConvertAsync(Guid userId, Guid id, NoteConversion command, string key, CancellationToken ct);
    Task<SupportDayView> DayAsync(Guid userId, DateOnly date, SupportDayChange? change, CancellationToken ct);
    Task<TaskView> EnergyAsync(Guid userId, Guid taskId, long version, EnergyLevel? energy, CancellationToken ct);
    Task<ReturnContext> ReturnAsync(Guid userId, Guid taskId, CancellationToken ct);
    Task<DayEndCandidates> CandidatesAsync(Guid userId, DateOnly date, int offset, int limit, CancellationToken ct);
}
public sealed class SupportService(ISupportStore store, CalendarService calendar)
{
    public Task<NoteView> CreateNoteAsync(Guid userId, NoteFields fields, CancellationToken ct) => store.CreateNoteAsync(userId, fields, ct);
    public Task<NoteView> EditNoteAsync(Guid userId, Guid id, NoteEdit edit, CancellationToken ct) => store.EditNoteAsync(userId, id, edit, ct);
    public Task<NoteView> RemoveNoteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct) => store.RemoveNoteAsync(userId, id, version, restore, ct);
    public Task<NotePage> NotesAsync(Guid userId, NoteQuery query, CancellationToken ct) => store.NotesAsync(userId, query, ct);
    public Task<NoteCategoryList> CategoriesAsync(Guid userId, CancellationToken ct) => store.CategoriesAsync(userId, ct);
    public Task<NoteCategoryView> CreateCategoryAsync(Guid userId, NoteCategoryFields fields, CancellationToken ct) => store.CreateCategoryAsync(userId, fields, ct);
    public Task<NoteCategoryView> ChangeCategoryAsync(Guid userId, Guid id, NoteCategoryChange change, CancellationToken ct) => store.ChangeCategoryAsync(userId, id, change, ct);
    public Task<NoteCategoryView> MoveCategoryAsync(Guid userId, Guid id, NoteCategoryMove move, CancellationToken ct) => store.MoveCategoryAsync(userId, id, move, ct);
    public Task<NoteCategoryView> RemoveCategoryAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct) => store.RemoveCategoryAsync(userId, id, version, restore, ct);
    public Task<NoteSystemViews> SystemViewsAsync(Guid userId, NoteSystemViews views, CancellationToken ct) => store.SystemViewsAsync(userId, views, ct);
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
