namespace Adhd.Domain.Tasks;

public enum MatrixQuadrant { Inbox, Do, Schedule, Delegate, Eliminate }
public sealed class MatrixItem
{
    public Guid UserId { get; set; }
    public Guid TaskId { get; set; }
    public MatrixQuadrant Quadrant { get; set; }
    public decimal SortOrder { get; set; }
}
public sealed class MatrixState
{
    public Guid UserId { get; set; }
    public long Version { get; set; }
}
