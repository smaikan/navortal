using Adhd.Application.Common;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Tasks;

public sealed record TaskFields(string Title, string? Description = null, TaskPriority Priority = TaskPriority.Normal, DateTimeOffset? DeadlineAt = null, bool CanSplit = true);
public sealed record TaskView(Guid Id, string Title, string? Description, TaskState State, TaskPriority Priority, DateTimeOffset? DeadlineAt, bool CanSplit,
    long? DirectEstimatedSeconds, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? ArchivedAt, long Version,
    Guid? ParentTaskId, decimal SortOrder, bool HasDirectWork, long? TargetBudgetSeconds,
    bool DirectWorkCompleted, bool RequiredForParent, CompletionOrigin? CompletionOrigin, DateTimeOffset? CompletedAt,
    Guid? ProjectId, Guid? PoolId, Guid? CategoryId, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null, bool AutoCompleteFromChildren = true, DateOnly? PlannedFrom = null, DateOnly? PlannedTo = null);
public sealed record TaskPage(TaskView[] Items, int Offset, int Limit, int Total, Adhd.Application.Sync.ReadCoverage? Coverage = null);
public sealed record TaskQuery(int Offset = 0, int Limit = 50, string? Search = null, bool IncludeArchived = false, TaskPriority? Priority = null,
    Guid? ProjectId = null, Guid? PoolId = null, Guid? CategoryId = null, Guid? TagId = null, string OrderBy = "CreatedDesc",
    TaskState? State = null, bool IncludeCompleted = true, bool? IsPlanned = null, DateTimeOffset? From = null, DateTimeOffset? To = null, DateOnly? AssignedOn = null, Adhd.Domain.Support.EnergyLevel? EnergyDemand = null, bool ExcludeRecurring = false, long? MinEstimateSeconds = null, long? MaxEstimateSeconds = null, DateOnly? DateFrom = null, DateOnly? DateTo = null);
public interface ITaskStore
{
    Task<TaskView> CreateAsync(Guid userId, TaskFields fields, CancellationToken ct);
    Task<TaskView> GetAsync(Guid userId, Guid id, CancellationToken ct);
    Task<TaskPage> ListAsync(Guid userId, TaskQuery query, CancellationToken ct);
    Task<TaskView> UpdateAsync(Guid userId, Guid id, long version, TaskFields? fields, bool archive, CancellationToken ct);
    Task<TaskView> DeleteAsync(Guid userId, Guid id, long version, CancellationToken ct);
    Task<TaskView> RestoreAsync(Guid userId, Guid id, long version, CancellationToken ct);
    Task<TaskView> SetPlannedRangeAsync(Guid userId, Guid id, long version, DateOnly? from, DateOnly? to, CancellationToken ct);
    Task<TreeRowSummary> SummaryAsync(Guid userId, Guid id, CancellationToken ct);
}
public sealed class TaskService(ITaskStore store)
{
    public Task<TaskView> CreateAsync(Guid userId, TaskFields fields, CancellationToken ct) => store.CreateAsync(userId, ValidateFields(fields), ct);
    public Task<TaskView> GetAsync(Guid userId, Guid id, CancellationToken ct) => store.GetAsync(userId, id, ct);
    public Task<TaskPage> ListAsync(Guid userId, TaskQuery query, CancellationToken ct)
    {
        if (query.Offset is < 0 or > 100000 || query.Limit is < 1 or > 100 || query.Search?.Length > 200 || (query.Priority.HasValue && !Enum.IsDefined(query.Priority.Value))
            || query.OrderBy is not ("CreatedDesc" or "Title" or "Priority" or "Deadline" or "CompletedDesc") || (query.State.HasValue && !Enum.IsDefined(query.State.Value)))
            throw new UseCaseException(ErrorKind.Validation, "task_query_invalid", "Liste filtreleri geçersiz.");
        if (query.MinEstimateSeconds < 0 || query.MaxEstimateSeconds < 0 || query.MinEstimateSeconds > query.MaxEstimateSeconds
            || query.DateFrom.HasValue != query.DateTo.HasValue || query.DateFrom > query.DateTo || query.DateTo?.DayNumber - query.DateFrom?.DayNumber > 366)
            throw new UseCaseException(ErrorKind.Validation, "task_query_invalid", "Liste filtreleri geçersiz.");
        return store.ListAsync(userId, query, ct);
    }
    public Task<TaskView> UpdateAsync(Guid userId, Guid id, long version, TaskFields fields, CancellationToken ct) => store.UpdateAsync(userId, id, version, ValidateFields(fields), false, ct);
    public Task<TaskView> ArchiveAsync(Guid userId, Guid id, long version, CancellationToken ct) => store.UpdateAsync(userId, id, version, null, true, ct);
    public Task<TaskView> DeleteAsync(Guid userId, Guid id, long version, CancellationToken ct) => store.DeleteAsync(userId, id, version, ct);
    public Task<TaskView> RestoreAsync(Guid userId, Guid id, long version, CancellationToken ct) => store.RestoreAsync(userId, id, version, ct);
    public Task<TaskView> SetPlannedRangeAsync(Guid userId, Guid id, long version, DateOnly? from, DateOnly? to, CancellationToken ct)
    {
        if (from.HasValue != to.HasValue || from > to || to?.DayNumber - from?.DayNumber > 366)
            throw new UseCaseException(ErrorKind.Validation, "planned_range_invalid", "Tarih aralığı için başlangıç ve bitişi birlikte, en çok 367 gün olarak seçin.");
        return store.SetPlannedRangeAsync(userId, id, version, from, to, ct);
    }
    public Task<TreeRowSummary> SummaryAsync(Guid userId, Guid id, CancellationToken ct) => store.SummaryAsync(userId, id, ct);
    public static TaskFields ValidateFields(TaskFields fields)
    {
        if (string.IsNullOrWhiteSpace(fields.Title) || fields.Title.Trim().Length > 300 || fields.Description?.Length > 10000 || !Enum.IsDefined(fields.Priority))
            throw new UseCaseException(ErrorKind.Validation, "task_invalid", "Görev başlığını veya alanlarını kontrol edin.");
        return fields with { Title = fields.Title.Trim(), DeadlineAt = fields.DeadlineAt?.ToUniversalTime() };
    }
}
