using System.ComponentModel.DataAnnotations;
using Adhd.Application.Work;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/work-sessions/start-now")]
public sealed class ImmediateWorkController(ImmediateWorkService service) : ControllerBase
{
    [HttpPost]
    public async Task<ImmediateWorkResult> Start(ImmediateWorkRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.StartNowAsync(Guid.Parse(User.FindFirst("sub")!.Value), new(request.TaskId!.Value, request.ExpectedPlanningVersion!.Value,
            request.ExpectedSessionId, request.ExpectedSessionVersion, request.RemainingTaskIds), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result;
    }
}
public sealed class ImmediateWorkRequest
{
    [Required] public Guid? TaskId { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public Guid? ExpectedSessionId { get; set; }
    [Range(1, long.MaxValue)] public long? ExpectedSessionVersion { get; set; }
    [MaxLength(1000)] public Guid[]? RemainingTaskIds { get; set; }
}
