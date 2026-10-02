using System.ComponentModel.DataAnnotations;
using Adhd.Application.Work;
using Adhd.Domain.Work;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/work-sessions")]
public sealed class WorkController(WorkService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("start"), ProducesResponseType(typeof(WorkView), 201)]
    public async Task<ActionResult<WorkView>> Start(StartWorkRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.StartAsync(UserId, new(request.TaskId!.Value, request.ScheduleId, request.ScheduleVersion), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return Created($"/api/work-sessions/{result.Session.Id}", result.Session);
    }
    [HttpPost("{id:guid}/pause")] public Task<WorkView> Pause(Guid id, WorkTransitionRequest request, CancellationToken ct) => service.TransitionAsync(UserId, id, request.Version, "pause", ct);
    [HttpPost("{id:guid}/resume")] public Task<WorkView> Resume(Guid id, WorkTransitionRequest request, CancellationToken ct) => service.TransitionAsync(UserId, id, request.Version, "resume", ct);
    [HttpPost("{id:guid}/finish")] public Task<WorkView> Finish(Guid id, WorkTransitionRequest request, CancellationToken ct) => service.TransitionAsync(UserId, id, request.Version, "finish", ct);
    [HttpGet("{id:guid}")] public Task<WorkView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet("current")] public Task<CurrentWork> Current(CancellationToken ct) => service.CurrentAsync(UserId, ct);
    [HttpGet] public Task<WorkPage> List([FromQuery] WorkQuery query, CancellationToken ct) => service.ListAsync(UserId, query.Offset, query.Limit, query.State, ct);
    [HttpGet("{id:guid}/segments")] public Task<SegmentPage> Segments(Guid id, [FromQuery] WorkQuery query, CancellationToken ct) => service.SegmentsAsync(UserId, id, query.Offset, query.Limit, ct);
    [HttpGet("/api/tasks/{id:guid}/time")] public Task<TaskTimeView> TaskTime(Guid id, CancellationToken ct) => service.TaskTimeAsync(UserId, id, ct);
}
public sealed class StartWorkRequest
{
    [Required] public Guid? TaskId { get; set; }
    public Guid? ScheduleId { get; set; }
    [Range(1, long.MaxValue)] public long? ScheduleVersion { get; set; }
}
public sealed class WorkTransitionRequest { [Range(1, long.MaxValue)] public long Version { get; set; } }
public sealed class WorkQuery
{
    [Range(0, 100000)] public int Offset { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 50;
    public WorkState? State { get; set; }
}
