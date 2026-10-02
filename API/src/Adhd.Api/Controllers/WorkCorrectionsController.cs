using System.ComponentModel.DataAnnotations;
using Adhd.Application.Work;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/work-sessions")]
public sealed class WorkCorrectionsController(WorkCorrectionService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("manual"), ProducesResponseType(typeof(WorkView), 201)]
    public async Task<ActionResult<WorkView>> Manual(ManualWorkRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ManualAsync(UserId, new(request.TaskId!.Value, request.StartedAt!.Value, request.EndedAt!.Value, request.Reason), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return Created($"/api/work-sessions/{result.Session.Id}", result.Session);
    }
    [HttpPost("{id:guid}/segments/{segmentId:guid}/corrections")]
    public Task<WorkView> Correct(Guid id, Guid segmentId, CorrectWorkRequest request, CancellationToken ct) => service.CorrectAsync(UserId, id, segmentId,
        new(request.Version, request.SegmentVersion, request.StartedAt!.Value, request.EndedAt, request.IsVoided!.Value, request.Reason), ct);
    [HttpGet("{id:guid}/corrections")]
    public Task<CorrectionPage> List(Guid id, [FromQuery] WorkQuery query, CancellationToken ct) => service.CorrectionsAsync(UserId, id, query.Offset, query.Limit, ct);
}
public sealed class ManualWorkRequest
{
    [Required] public Guid? TaskId { get; set; }
    [Required] public DateTimeOffset? StartedAt { get; set; }
    [Required] public DateTimeOffset? EndedAt { get; set; }
    [Required, StringLength(2000)] public string Reason { get; set; } = "";
}
public sealed class CorrectWorkRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Range(1, long.MaxValue)] public long SegmentVersion { get; set; }
    [Required] public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? EndedAt { get; set; }
    [Required] public bool? IsVoided { get; set; }
    [Required, StringLength(2000)] public string Reason { get; set; } = "";
}
