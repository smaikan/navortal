using Adhd.Application.Common;
using Adhd.Domain.Tasks;

namespace Adhd.Application.Tasks;

public sealed record WorkDefinition(long Version, bool HasDirectWork, long? DirectEstimatedSeconds, long? TargetBudgetSeconds);
public sealed record TaskWorkloadReport(WorkloadSummary Summary, WorkComponent[] Components);
public sealed record WorkComponentPage(WorkComponent[] Items, int Offset, int Limit, int Total);
public interface ITaskWorkloadStore
{
    Task<TaskView> UpdateAsync(Guid userId, Guid taskId, WorkDefinition definition, CancellationToken ct);
    Task<TaskWorkloadReport> ReadAsync(Guid userId, Guid taskId, CancellationToken ct);
}
public sealed class TaskWorkloadService(ITaskWorkloadStore store)
{
    public Task<TaskView> UpdateAsync(Guid userId, Guid taskId, WorkDefinition definition, CancellationToken ct)
    {
        if (definition.DirectEstimatedSeconds < 0 || definition.TargetBudgetSeconds < 0 || (!definition.HasDirectWork && definition.DirectEstimatedSeconds.HasValue))
            throw new UseCaseException(ErrorKind.Validation, "work_definition_invalid", "Konteyner kendi tahminini taşıyamaz; süre negatif olamaz.");
        return store.UpdateAsync(userId, taskId, definition, ct);
    }
    public async Task<WorkloadSummary> SummaryAsync(Guid userId, Guid taskId, CancellationToken ct) => (await store.ReadAsync(userId, taskId, ct)).Summary;
    public async Task<WorkComponentPage> ComponentsAsync(Guid userId, Guid taskId, int offset, int limit, CancellationToken ct)
    {
        if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw new UseCaseException(ErrorKind.Validation, "work_query_invalid", "İş bileşeni sorgu sınırları geçersiz.");
        var report = await store.ReadAsync(userId, taskId, ct);
        return new(report.Components.Skip(offset).Take(limit).ToArray(), offset, limit, report.Components.Length);
    }
}
