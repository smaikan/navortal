namespace Adhd.Domain.Tasks;

public sealed class TaskTagLink
{
    public Guid UserId { get; set; }
    public Guid TaskId { get; set; }
    public Guid TagId { get; set; }
}
