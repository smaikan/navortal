namespace Adhd.Domain.Work;

public sealed class WorkSessionCorrection
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid SessionId { get; set; }
    public Guid SegmentId { get; set; }
    public long Sequence { get; set; }
    public string Kind { get; set; } = "Adjusted";
    public string Reason { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; }
    public string? PreviousValues { get; set; }
    public string NewValues { get; set; } = "{}";
    public string? PreviousSession { get; set; }
    public string NewSession { get; set; } = "{}";
}
