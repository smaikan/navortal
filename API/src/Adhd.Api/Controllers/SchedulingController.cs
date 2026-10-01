using System.ComponentModel.DataAnnotations;
using Adhd.Application.Scheduling;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/scheduling")]
public sealed class SchedulingController(SchedulingService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("preview")] public Task<SchedulingPreviewView> Preview(SchedulingRequestDto request, CancellationToken ct) => service.PreviewAsync(UserId, request.Command(), ct);
    [HttpGet("proposals/{id:guid}")] public Task<SchedulingPreviewView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpPost("undo-preview")] public Task<SchedulingPreviewView> Undo(UndoSchedulingRequest request, CancellationToken ct) => service.PreviewUndoAsync(UserId, new(request.ChangeSetId!.Value, request.ExpectedPlanningVersion, request.AllowProtectedChange), ct);
    [HttpPost("apply")]
    public async Task<SchedulingApplyResult> Apply(ApplySchedulingRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ApplyAsync(UserId, request.ProposalId!.Value, key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpPost("plan")]
    public async Task<SchedulingPreviewView> Plan(SchedulingRequestDto request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.PlanAsync(UserId, request.Command(), key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
}
public sealed class SchedulingRequestDto
{
    [Required] public DateOnly? Date { get; set; }
    [Required, MinLength(1), MaxLength(1000)] public Guid[] TaskIds { get; set; } = [];
    [Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public DateTimeOffset? NewWorkNotBefore { get; set; }
    public SchedulingRequest Command() => new(Date!.Value, TaskIds, ExpectedPlanningVersion, NewWorkNotBefore);
}
public sealed class ApplySchedulingRequest { [Required] public Guid? ProposalId { get; set; } }
public sealed class UndoSchedulingRequest
{
    [Required] public Guid? ChangeSetId { get; set; }
    [Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public bool AllowProtectedChange { get; set; }
}
