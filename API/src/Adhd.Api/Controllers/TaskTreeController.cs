using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks")]
public sealed class TaskTreeController(TaskTreeService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("{id:guid}/children"), ProducesResponseType(typeof(TaskView), 201)]
    public async Task<ActionResult<TaskView>> CreateChild(Guid id, CreateChildRequest request, CancellationToken ct)
    {
        var task = await service.CreateChildAsync(UserId, id, request.ParentVersion, request.Fields(), request.ParentWorkDisposition, ct);
        return Created($"/api/tasks/{task.Id}", task);
    }
    [HttpPost("{id:guid}/move")]
    public Task<TaskView> Move(Guid id, MoveTaskRequest request, CancellationToken ct) =>
        service.MoveAsync(UserId, id, new(request.Version, request.ParentTaskId, request.ParentVersion, request.BeforeSiblingId, request.ParentWorkDisposition), ct);
    [HttpGet("children")]
    public Task<TreePage> Children([FromQuery] Guid? parentId = null, [FromQuery] int offset = 0, [FromQuery] int limit = 50, [FromQuery] bool includeArchived = false, [FromQuery] bool? completed = null, CancellationToken ct = default) =>
        service.ChildrenAsync(UserId, parentId, offset, limit, includeArchived, ct, completed);
    [HttpGet("{id:guid}/subtree")]
    public Task<TreePage> Subtree(Guid id, [FromQuery] int offset = 0, [FromQuery] int limit = 50, [FromQuery] bool includeArchived = false, CancellationToken ct = default) =>
        service.SubtreeAsync(UserId, id, offset, limit, includeArchived, ct);
}
public sealed class CreateChildRequest : TaskFieldsRequest
{
    [Range(1, long.MaxValue)] public long ParentVersion { get; set; }
    public ParentWorkDisposition? ParentWorkDisposition { get; set; }
}
public sealed class MoveTaskRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public Guid? ParentTaskId { get; set; }
    [Range(1, long.MaxValue)] public long? ParentVersion { get; set; }
    public Guid? BeforeSiblingId { get; set; }
    public ParentWorkDisposition? ParentWorkDisposition { get; set; }
}
