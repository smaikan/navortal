using Adhd.Application.Analytics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/analytics")]
public sealed class PlanAnalyticsController(PlanAnalyticsService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("plans")]
    public Task<PlanAnalyticsView> Plans([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, [FromQuery] int startToleranceSeconds = 60, CancellationToken ct = default) => service.ReadAsync(UserId, new(fromDate, toDate, startToleranceSeconds), ct);
    [HttpGet("days/{date}/review")]
    public Task<PlanAnalyticsDay> Review(DateOnly date, [FromQuery] int startToleranceSeconds = 60, CancellationToken ct = default) => service.ReviewAsync(UserId, date, startToleranceSeconds, ct);
    [HttpGet("estimate-accuracy")]
    public Task<EstimateAccuracyView> Accuracy([FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, CancellationToken ct) => service.AccuracyAsync(UserId, fromDate, toDate, ct);
    [HttpGet("estimate-suggestion")]
    public Task<EstimateSuggestionView> Suggestion([FromQuery] Guid taskId, [FromQuery] DateOnly fromDate, [FromQuery] DateOnly toDate, CancellationToken ct) => service.SuggestionAsync(UserId, taskId, fromDate, toDate, ct);
}
