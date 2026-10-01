using Adhd.Application.Common;

namespace Adhd.Application.Tasks;

public sealed record ClassificationValues(Guid? ProjectId, Guid? PoolId, Guid? CategoryId, Guid[] TagIds);
public sealed record ClassificationView(Guid TaskId, long Version, long PlanningVersion, ClassificationValues Values);
public sealed record ClassificationChange(long Version, ClassificationValues Values, bool ApplyToSubtree, long? ExpectedPlanningVersion);
public interface ITaskClassificationStore
{
    Task<ClassificationView> ReadAsync(Guid userId, Guid taskId, CancellationToken ct);
    Task<ClassificationView> WriteAsync(Guid userId, Guid taskId, ClassificationChange change, CancellationToken ct);
}
public sealed class TaskClassificationService(ITaskClassificationStore store)
{
    public Task<ClassificationView> ReadAsync(Guid userId, Guid taskId, CancellationToken ct) => store.ReadAsync(userId, taskId, ct);
    public Task<ClassificationView> WriteAsync(Guid userId, Guid taskId, ClassificationChange change, CancellationToken ct)
    {
        if (change.Values.TagIds is null || change.Values.TagIds.Length > 50) throw new UseCaseException(ErrorKind.Validation, "tags_invalid", "En fazla 50 etiket seçin.");
        if (change.ApplyToSubtree && change.ExpectedPlanningVersion is null) throw new UseCaseException(ErrorKind.Validation, "planning_version_required", "Alt ağaç için planlama sürümü gerekli.");
        return store.WriteAsync(userId, taskId, change with { Values = change.Values with { TagIds = change.Values.TagIds.Distinct().Order().ToArray() } }, ct);
    }
}
