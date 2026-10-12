using Adhd.Domain.Tasks;
namespace Adhd.Application.Tasks;

public sealed record MatrixCard(TaskPickerRow Task);
public sealed record MatrixColumn(MatrixQuadrant Quadrant, MatrixCard[] Items, int Offset, int Limit, int Total);
public sealed record MatrixView(long Version, MatrixColumn[] Columns);
public sealed record MatrixChange(long Version, MatrixQuadrant Quadrant, Guid? BeforeTaskId);
public sealed record MatrixWriteResult(long Version, Guid TaskId);
public interface IMatrixStore
{
    Task<MatrixView> ReadAsync(Guid userId, int[] offsets, int limit, CancellationToken ct);
    Task<TaskPickerPage> CandidatesAsync(Guid userId, string? search, int offset, int limit, CancellationToken ct);
    Task<MatrixWriteResult> WriteAsync(Guid userId, Guid taskId, MatrixChange change, bool add, CancellationToken ct);
    Task<MatrixWriteResult> RemoveAsync(Guid userId, Guid taskId, long version, CancellationToken ct);
}
