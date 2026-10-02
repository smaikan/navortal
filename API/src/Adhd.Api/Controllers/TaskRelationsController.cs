using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks/{id:guid}")]
public sealed class TaskRelationsController(TaskRelationsService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("dependencies"), ProducesResponseType(typeof(TaskRelationView), 201)]
    public async Task<ActionResult<TaskRelationView>> AddDependency(Guid id, DependencyRequest request, CancellationToken ct) =>
        Created($"/api/tasks/{id}/dependencies", await service.AddAsync(UserId, id, request.PredecessorTaskId, request.Version, TaskRelationKind.Dependency, ct));
    [HttpPost("ordering"), ProducesResponseType(typeof(TaskRelationView), 201)]
    public async Task<ActionResult<TaskRelationView>> AddOrdering(Guid id, OrderingRequest request, CancellationToken ct) =>
        Created($"/api/tasks/{id}/ordering", await service.AddAsync(UserId, id, request.BeforeTaskId, request.Version, TaskRelationKind.Ordering, ct));
    [HttpDelete("dependencies/{sourceId:guid}"), ProducesResponseType(204)]
    public async Task<IActionResult> RemoveDependency(Guid id, Guid sourceId, [FromQuery, Range(1, long.MaxValue)] long version, CancellationToken ct)
    { await service.RemoveAsync(UserId, id, sourceId, version, TaskRelationKind.Dependency, ct); return NoContent(); }
    [HttpDelete("ordering/{sourceId:guid}"), ProducesResponseType(204)]
    public async Task<IActionResult> RemoveOrdering(Guid id, Guid sourceId, [FromQuery, Range(1, long.MaxValue)] long version, CancellationToken ct)
    { await service.RemoveAsync(UserId, id, sourceId, version, TaskRelationKind.Ordering, ct); return NoContent(); }
    [HttpGet("dependencies")]
    public Task<TaskRelationPage> Dependencies(Guid id, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ListAsync(UserId, id, TaskRelationKind.Dependency, offset, limit, ct);
    [HttpGet("ordering")]
    public Task<TaskRelationPage> Ordering(Guid id, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ListAsync(UserId, id, TaskRelationKind.Ordering, offset, limit, ct);
    [HttpGet("start-eligibility")]
    public Task<TaskStartDecision> CanStart(Guid id, CancellationToken ct) => service.CanStartAsync(UserId, id, ct);
}
public sealed class DependencyRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public Guid PredecessorTaskId { get; set; }
}
public sealed class OrderingRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public Guid BeforeTaskId { get; set; }
}
