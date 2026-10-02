using Adhd.Application.Analytics;
using Adhd.Domain.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/analytics")]
public sealed class AnalyticsController(ActualAnalyticsService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("actual")]
    public Task<ActualAnalyticsView> Actual([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, [FromQuery] AnalyticsBucket bucket = AnalyticsBucket.Day, CancellationToken ct = default) => service.ReadAsync(UserId, new(fromDate, toDate, bucket), ct);
    [HttpGet("actual/breakdown")]
    public Task<ActualBreakdownPage> Breakdown([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, [FromQuery] AnalyticsDimension dimension = AnalyticsDimension.Task, [FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.BreakdownAsync(UserId, new(fromDate, toDate), dimension, offset, limit, ct);
}
