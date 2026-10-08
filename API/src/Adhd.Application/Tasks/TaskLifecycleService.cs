using Adhd.Domain.Tasks;

namespace Adhd.Application.Tasks;

public sealed record TaskStateCommand(long Version, TaskAction Action, ParentCompletionChoice? ParentCompletionChoice, string? Reason = null);
public interface ITaskLifecycleStore
{
    Task<TaskView> ExecuteAsync(Guid userId, Guid taskId, TaskStateCommand command, CancellationToken ct);
    Task<TaskView> SetRequiredAsync(Guid userId, Guid taskId, long version, bool required, CancellationToken ct);
    Task<TaskView> SetAutoCompleteAsync(Guid userId, Guid taskId, long version, bool enabled, CancellationToken ct);
    Task<TaskProgress> ProgressAsync(Guid userId, Guid taskId, CancellationToken ct);
}
public sealed class TaskLifecycleService(ITaskLifecycleStore store)
{
    public Task<TaskView> ExecuteAsync(Guid userId, Guid taskId, TaskStateCommand command, CancellationToken ct) => store.ExecuteAsync(userId, taskId, command, ct);
    public Task<TaskView> SetRequiredAsync(Guid userId, Guid taskId, long version, bool required, CancellationToken ct) => store.SetRequiredAsync(userId, taskId, version, required, ct);
    public Task<TaskView> SetAutoCompleteAsync(Guid userId, Guid taskId, long version, bool enabled, CancellationToken ct) => store.SetAutoCompleteAsync(userId, taskId, version, enabled, ct);
    public Task<TaskProgress> ProgressAsync(Guid userId, Guid taskId, CancellationToken ct) => store.ProgressAsync(userId, taskId, ct);
}
