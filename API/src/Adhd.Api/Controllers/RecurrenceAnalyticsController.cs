using Adhd.Application.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/analytics/recurrences")]
public sealed class RecurrenceAnalyticsController(RecurrenceAnalyticsService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet]
    public Task<RecurrenceAnalyticsView> List([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, [FromQuery] DateOnly? compareFromDate = null, [FromQuery] DateOnly? compareToDate = null, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ReadAsync(UserId, new(fromDate, toDate, compareFromDate, compareToDate, offset, limit), ct);
    [HttpGet("{id:guid}")]
    public Task<RecurrenceAnalyticsDetail> Detail(Guid id, CancellationToken ct) => service.DetailAsync(UserId, id, ct);
}
