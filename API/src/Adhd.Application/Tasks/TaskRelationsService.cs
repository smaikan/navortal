using Adhd.Application.Common;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Tasks;

public enum TaskRelationKind { Dependency, Ordering }
public sealed record TaskRelationView(Guid Id, Guid SourceTaskId, Guid TargetTaskId, string Kind);
public sealed record TaskRelationPage(TaskRelationView[] Items, int Offset, int Limit, int Total);
public interface ITaskRelationsStore
{
    Task<TaskRelationView> AddAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct);
    Task RemoveAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct);
    Task<TaskRelationPage> ListAsync(Guid userId, Guid targetId, TaskRelationKind kind, int offset, int limit, CancellationToken ct);
    Task<TaskStartDecision> CanStartAsync(Guid userId, Guid taskId, CancellationToken ct);
}
public sealed class TaskRelationsService(ITaskRelationsStore store)
{
    public Task<TaskRelationView> AddAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct)
    {
        if (targetId == sourceId) throw new UseCaseException(ErrorKind.Validation, "relation_self", "Görev kendisine bağlanamaz.");
        return store.AddAsync(userId, targetId, sourceId, version, kind, ct);
    }
    public Task RemoveAsync(Guid userId, Guid targetId, Guid sourceId, long version, TaskRelationKind kind, CancellationToken ct) => store.RemoveAsync(userId, targetId, sourceId, version, kind, ct);
    public Task<TaskRelationPage> ListAsync(Guid userId, Guid targetId, TaskRelationKind kind, int offset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw new UseCaseException(ErrorKind.Validation, "relation_query_invalid", "İlişki sorgu sınırları geçersiz.");
        return store.ListAsync(userId, targetId, kind, offset, limit, ct);
    }
    public Task<TaskStartDecision> CanStartAsync(Guid userId, Guid taskId, CancellationToken ct) => store.CanStartAsync(userId, taskId, ct);
}
