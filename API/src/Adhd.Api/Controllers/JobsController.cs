using Adhd.Application.Jobs;
using Adhd.Domain.Jobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/jobs")]
public sealed class JobsController(JobService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("outbox")] public Task<OutboxPage> List([FromQuery] OutboxState? state = null, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ListAsync(UserId, state, offset, limit, ct);
    [HttpPost("outbox/{id:guid}/retry")] public Task<OutboxView> Retry(Guid id, TaskVersionRequest request, CancellationToken ct) => service.RetryAsync(UserId, id, request.Version, ct);
    [HttpGet("reminders")] public Task<ReminderPage> Reminders([FromQuery] ReminderState? state = null, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.RemindersAsync(UserId, state, offset, limit, ct);
}
