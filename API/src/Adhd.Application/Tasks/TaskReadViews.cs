using Adhd.Application.Work;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Tasks;

public sealed record TaskAncestorRow(Guid Id, string Title, Guid? ParentTaskId, long Version);
public sealed record TaskAncestorPage(Guid TaskId, long PlanningVersion, TaskAncestorRow[] Items, string? NextCursor);
public sealed record TaskResourceLabel(string Kind, Guid Id, string Name, long Version, DateTimeOffset? ArchivedAt);
public sealed record TaskDetailView(TaskView Task, TreeRowSummary RowSummary, WorkloadSummary Workload,
    TaskTimeView Time, TaskProgress Progress, ClassificationView Classification, TaskResourceLabel[] Labels,
    TaskAncestorRow? Parent, long PlanningVersion, DateTimeOffset ServerNow);
public interface ITaskReadStore
{
    Task<TaskPickerView> PickerAsync(Guid userId, DateOnly? date, string? search, int offset, int assignedOffset, int limit, CancellationToken ct, bool hierarchy = false);
    Task<ResourceTaskTreePage> CollectionAsync(Guid userId, string kind, Guid id, int offset, int limit, CancellationToken ct);
    Task<TaskDetailView> DetailAsync(Guid userId, Guid taskId, CancellationToken ct);
    Task<TaskAncestorPage> AncestorsAsync(Guid userId, Guid taskId, int limit, string? cursor, CancellationToken ct);
}
public sealed record TaskPickerRow(Guid Id, string Title, Guid? ParentTaskId, string? ParentTitle,
    long? DirectEstimatedSeconds, TaskPriority Priority, Adhd.Domain.Support.EnergyLevel? EnergyDemand, TaskPickerRow[]? Children = null);
public sealed record TaskPickerPage(TaskPickerRow[] Items, int Offset, int Limit, int Total);
public sealed record TaskPickerView(TaskPickerPage Assigned, TaskPickerPage Other, bool HasExactMatch, Adhd.Application.Sync.ReadCoverage? Coverage = null);

public sealed record ResourceTaskTreePage(TaskView[] Roots, TaskView[] Nodes, TaskAncestorRow[] Parents, int Offset, int Limit, int Total, Guid[]? ContextTaskIds = null, int? TaskCount = null);
