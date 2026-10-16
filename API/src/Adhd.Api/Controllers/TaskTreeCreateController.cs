using System.ComponentModel.DataAnnotations;
using Adhd.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

// Yeni görevi iç içe alt görevleriyle tek atomik işlemde açar. Idempotency-Key zorunlu.
[ApiController, Authorize, Route("api/tasks/tree")]
public sealed class TaskTreeCreateController(TaskTreeCreateService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost, ProducesResponseType(typeof(TaskTreeCreateResult), 201)]
    public async Task<ActionResult<TaskTreeCreateResult>> Create(TaskTreeRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var (result, replayed) = await service.CreateAsync(UserId, request.Node(), key ?? "", ct);
        if (replayed) Response.Headers["Idempotent-Replay"] = "true";
        return StatusCode(201, result);
    }
}
public sealed class TaskTreeRequest
{
    [Required, StringLength(300)] public string Title { get; set; } = "";
    [MaxLength(TaskTreeCreateService.MaxNodes)] public TaskTreeRequest[]? Children { get; set; }
    public TaskTreeNode Node() => new(Title, Children?.Select(child => child.Node()).ToArray());
}
