using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks/{id:guid}")]
public sealed class TaskWorkloadController(TaskWorkloadService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPut("work-definition")]
    public Task<TaskView> Update(Guid id, WorkDefinitionRequest request, CancellationToken ct) =>
        service.UpdateAsync(UserId, id, new(request.Version, request.HasDirectWork!.Value, request.DirectEstimatedSeconds, request.TargetBudgetSeconds), ct);
    [HttpGet("workload")] public Task<WorkloadSummary> Summary(Guid id, CancellationToken ct) => service.SummaryAsync(UserId, id, ct);
    [HttpGet("work-components")]
    public Task<WorkComponentPage> Components(Guid id, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ComponentsAsync(UserId, id, offset, limit, ct);
}
public sealed class WorkDefinitionRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required] public bool? HasDirectWork { get; set; }
    [Range(0, long.MaxValue)] public long? DirectEstimatedSeconds { get; set; }
    [Range(0, long.MaxValue)] public long? TargetBudgetSeconds { get; set; }
}
