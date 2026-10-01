using System.ComponentModel.DataAnnotations;
using Adhd.Application.Scheduling;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/scheduling")]
public sealed class DistributionController(DistributionService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("distribute-preview")]
    public Task<DistributionPreviewView> Preview(DistributionRequestDto request, CancellationToken ct) => service.PreviewAsync(UserId, new(request.FromDate!.Value, request.ToDate!.Value, request.TaskIds, request.ExpectedPlanningVersion), ct);
    [HttpGet("distribution-proposals/{id:guid}")] public Task<DistributionPreviewView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpPost("undo-multi-preview")] public Task<DistributionPreviewView> Undo(UndoSchedulingRequest request, CancellationToken ct) => service.UndoAsync(UserId, new(request.ChangeSetId!.Value, request.ExpectedPlanningVersion, request.AllowProtectedChange), ct);
    [HttpPost("distribute-plan")]
    public async Task<DistributionPreviewView> Plan(DistributionRequestDto request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.PlanAsync(UserId, new(request.FromDate!.Value, request.ToDate!.Value, request.TaskIds, request.ExpectedPlanningVersion), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpPost("distribute-apply")]
    public async Task<SchedulingApplyResult> Apply(ApplySchedulingRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ApplyAsync(UserId, request.ProposalId!.Value, key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
}
public sealed class DistributionRequestDto
{
    [Required] public DateOnly? FromDate { get; set; }
    [Required] public DateOnly? ToDate { get; set; }
    [Required, MinLength(1), MaxLength(1000)] public Guid[] TaskIds { get; set; } = [];
    [Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
}
