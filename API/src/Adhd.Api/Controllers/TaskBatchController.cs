using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

// UI-R3 "Kafamı boşalt": many titles become root tasks atomically. Idempotency-Key is required.
[ApiController, Authorize, Route("api/tasks/batch")]
public sealed class TaskBatchController(TaskBatchService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost, ProducesResponseType(typeof(TaskBatchResult), 201)]
    public async Task<ActionResult<TaskBatchResult>> Create(TaskBatchRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var (result, replayed) = await service.CreateAsync(UserId, new(request.Titles, request.PoolId), key ?? "", ct);
        if (replayed) Response.Headers["Idempotent-Replay"] = "true";
        return StatusCode(201, result);
    }
}
public sealed class TaskBatchRequest
{
    [Required, MinLength(1), MaxLength(50)] public string[] Titles { get; set; } = [];
    public Guid? PoolId { get; set; }
}
