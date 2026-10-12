using Adhd.Application.Common;

namespace Adhd.Application.Tasks;

public enum ParentWorkDisposition { PreserveDirect, ConvertToContainer }
public sealed record MoveTask(long Version, Guid? ParentTaskId, long? ParentVersion, Guid? BeforeSiblingId, ParentWorkDisposition? ParentWorkDisposition);
public sealed record TreePage(TaskView[] Items, int Offset, int Limit, bool HasMore, TreeRowSummary[]? Summaries = null);
// Çocuk sayfasına doğrudan açık çocuk sayısını ve alt ağaç tahminini ekle. Toplanamıyorsa null.
public sealed record TreeRowSummary(Guid TaskId, int ChildCount, int CompletedChildCount, long? KnownEstimatedSeconds, int UnknownEstimateCount,
    DateOnly? EffectiveFrom = null, DateOnly? EffectiveTo = null, bool RangeFromChildren = false, DateOnly? UrgentPlanDate = null);
public interface ITaskTreeStore
{
    Task<TaskView> CreateChildAsync(Guid userId, Guid parentId, long parentVersion, TaskFields fields, ParentWorkDisposition? disposition, CancellationToken ct);
    Task<TaskView> MoveAsync(Guid userId, Guid taskId, MoveTask move, CancellationToken ct);
    Task<TreePage> ChildrenAsync(Guid userId, Guid? parentId, int offset, int limit, bool includeArchived, CancellationToken ct, bool? completed = null, bool excludeRecurring = false);
    Task<TreePage> SubtreeAsync(Guid userId, Guid taskId, int offset, int limit, bool includeArchived, CancellationToken ct);
}
public sealed class TaskTreeService(ITaskTreeStore store)
{
    public Task<TaskView> CreateChildAsync(Guid userId, Guid parentId, long parentVersion, TaskFields fields, ParentWorkDisposition? disposition, CancellationToken ct) =>
        store.CreateChildAsync(userId, parentId, parentVersion, TaskService.ValidateFields(fields), disposition, ct);
    public Task<TaskView> MoveAsync(Guid userId, Guid taskId, MoveTask move, CancellationToken ct)
    {
        if (move.ParentTaskId.HasValue && move.ParentVersion is null)
            throw new UseCaseException(ErrorKind.Validation, "parent_version_required", "Hedef üst görevin sürümü gerekli.");
        return store.MoveAsync(userId, taskId, move, ct);
    }
    // completed=false açık kardeşleri sırayla getirir. true bitenleri en yeni bitenden başlatır.
    public Task<TreePage> ChildrenAsync(Guid userId, Guid? parentId, int offset, int limit, bool includeArchived, CancellationToken ct, bool? completed = null, bool excludeRecurring = false)
    { ValidatePage(offset, limit); return store.ChildrenAsync(userId, parentId, offset, limit, includeArchived, ct, completed, excludeRecurring); }
    public Task<TreePage> SubtreeAsync(Guid userId, Guid taskId, int offset, int limit, bool includeArchived, CancellationToken ct)
    { ValidatePage(offset, limit); return store.SubtreeAsync(userId, taskId, offset, limit, includeArchived, ct); }
    private static void ValidatePage(int offset, int limit)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100)
            throw new UseCaseException(ErrorKind.Validation, "tree_query_invalid", "Ağaç sorgu sınırları geçersiz.");
    }
}
