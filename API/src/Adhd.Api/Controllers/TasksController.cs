using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks")]
public sealed class TasksController(TaskService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost, ProducesResponseType(typeof(TaskView), 201)] public async Task<ActionResult<TaskView>> Create(TaskFieldsRequest request, CancellationToken ct)
    {
        var task = await service.CreateAsync(UserId, request.Fields(), ct);
        return CreatedAtAction(nameof(Get), new { id = task.Id }, task);
    }
    [HttpGet("{id:guid}")] public Task<TaskView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet] public Task<TaskPage> List([FromQuery] int offset = 0, [FromQuery] int limit = 50, [FromQuery] string? search = null,
        [FromQuery] bool includeArchived = false, [FromQuery] TaskPriority? priority = null, [FromQuery] Guid? projectId = null, [FromQuery] Guid? poolId = null,
        [FromQuery] Guid? categoryId = null, [FromQuery] Guid? tagId = null, [FromQuery] string orderBy = "CreatedDesc", [FromQuery] TaskState? state = null,
        [FromQuery] bool includeCompleted = true, [FromQuery] bool? isPlanned = null, [FromQuery] DateTimeOffset? from = null, [FromQuery] DateTimeOffset? to = null, [FromQuery] DateOnly? assignedOn = null, [FromQuery] Adhd.Domain.Support.EnergyLevel? energyDemand = null, [FromQuery] bool excludeRecurring = false, [FromQuery] long? minEstimateSeconds = null, [FromQuery] long? maxEstimateSeconds = null, [FromQuery] DateOnly? dateFrom = null, [FromQuery] DateOnly? dateTo = null, CancellationToken ct = default) =>
        service.ListAsync(UserId, new(offset, limit, search, includeArchived, priority, projectId, poolId, categoryId, tagId, orderBy, state, includeCompleted, isPlanned, from, to, assignedOn, energyDemand, excludeRecurring, minEstimateSeconds, maxEstimateSeconds, dateFrom, dateTo), ct);
    [HttpPut("{id:guid}")] public Task<TaskView> Update(Guid id, UpdateTaskRequest request, CancellationToken ct) => service.UpdateAsync(UserId, id, request.Version, request.Fields(), ct);
    [HttpPost("{id:guid}/archive")] public Task<TaskView> Archive(Guid id, TaskVersionRequest request, CancellationToken ct) => service.ArchiveAsync(UserId, id, request.Version, ct);
    [HttpPut("{id:guid}/planned-range")] public Task<TaskView> PlannedRange(Guid id, TaskPlannedRangeRequest request, CancellationToken ct) => service.SetPlannedRangeAsync(UserId, id, request.Version, request.PlannedFrom, request.PlannedTo, ct);
    [HttpGet("{id:guid}/summary")] public Task<TreeRowSummary> Summary(Guid id, CancellationToken ct) => service.SummaryAsync(UserId, id, ct);
    [HttpPost("{id:guid}/delete")] public Task<TaskView> Delete(Guid id, TaskVersionRequest request, CancellationToken ct) => service.DeleteAsync(UserId, id, request.Version, ct);
    [HttpPost("{id:guid}/restore")] public Task<TaskView> Restore(Guid id, TaskVersionRequest request, CancellationToken ct) => service.RestoreAsync(UserId, id, request.Version, ct);
}
public class TaskFieldsRequest
{
    [Required, StringLength(300)] public string Title { get; set; } = "";
    [StringLength(10000)] public string? Description { get; set; }
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public DateTimeOffset? DeadlineAt { get; set; }
    public bool CanSplit { get; set; } = true;
    public TaskFields Fields() => new(Title, Description, Priority, DeadlineAt, CanSplit);
}
public sealed class UpdateTaskRequest : TaskFieldsRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
public sealed class TaskPlannedRangeRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    public DateOnly? PlannedFrom { get; set; }
    public DateOnly? PlannedTo { get; set; }
}
public sealed class TaskVersionRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
