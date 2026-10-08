using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks/{id:guid}")]
public sealed class TaskLifecycleController(TaskLifecycleService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("state")] public Task<TaskView> State(Guid id, TaskStateRequest request, CancellationToken ct) =>
        service.ExecuteAsync(UserId, id, new(request.Version, request.Action!.Value, request.ParentCompletionChoice, request.Reason), ct);
    [HttpPut("required")] public Task<TaskView> Required(Guid id, TaskRequiredRequest request, CancellationToken ct) =>
        service.SetRequiredAsync(UserId, id, request.Version, request.RequiredForParent!.Value, ct);
    [HttpPut("auto-complete")] public Task<TaskView> AutoComplete(Guid id, TaskAutoCompleteRequest request, CancellationToken ct) =>
        service.SetAutoCompleteAsync(UserId, id, request.Version, request.AutoCompleteFromChildren!.Value, ct);
    [HttpGet("progress")] public Task<TaskProgress> Progress(Guid id, CancellationToken ct) => service.ProgressAsync(UserId, id, ct);
}
public sealed class TaskStateRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required] public TaskAction? Action { get; set; }
    public ParentCompletionChoice? ParentCompletionChoice { get; set; }
    [StringLength(2000)] public string? Reason { get; set; }
}
public sealed class TaskAutoCompleteRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required] public bool? AutoCompleteFromChildren { get; set; }
}
public sealed class TaskRequiredRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required] public bool? RequiredForParent { get; set; }
}
