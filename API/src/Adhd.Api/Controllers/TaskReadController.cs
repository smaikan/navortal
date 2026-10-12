using Adhd.Application.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/tasks/{id:guid}")]
public sealed class TaskReadController(ITaskReadStore store) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("/api/tasks/picker")] public Task<TaskPickerView> Picker([FromQuery] DateOnly? date = null, [FromQuery] string? search = null,
        [FromQuery] int offset = 0, [FromQuery] int assignedOffset = 0, [FromQuery] int limit = 25, CancellationToken ct = default) =>
        store.PickerAsync(UserId, date, search, offset, assignedOffset, limit, ct);
    [HttpGet("detail-view")] public Task<TaskDetailView> Detail(Guid id, CancellationToken ct) => store.DetailAsync(UserId, id, ct);
    [HttpGet("ancestors")] public Task<TaskAncestorPage> Ancestors(Guid id, [FromQuery] int limit = 16,
        [FromQuery] string? cursor = null, CancellationToken ct = default) => store.AncestorsAsync(UserId, id, limit, cursor, ct);
}
