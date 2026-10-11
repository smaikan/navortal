using System.ComponentModel.DataAnnotations;
using Adhd.Application.Planning;
using Adhd.Domain.Planning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/schedules")]
public sealed class PlanningController(PlanningService service, DayGlanceService glance, IDayOverviewStore overview, IDaySignalsStore signals) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("/api/daily-plans/{date}")] public Task<DailyPlanView> Day(DateOnly date, CancellationToken ct) => service.DayAsync(UserId, date, ct);
    // Gün çubuğunda çalışma ve plan kalanı, bilinmeyen tahminler, öğe sayıları, gerçek süre ve görev ipuçları var.
    [HttpGet("/api/daily-plans/{date}/glance")] public Task<DayGlanceView> Glance(DateOnly date, CancellationToken ct) => glance.ReadAsync(UserId, date, ct);
    [HttpGet("/api/daily-plans/{date}/overview")]
    public Task<DayOverviewView> Overview(DateOnly date, [FromQuery] DayOverviewQuery query, CancellationToken ct)
        => overview.OverviewAsync(UserId, date, query.ScheduleOffset, query.ScheduleLimit, query.ItemOffset, query.ItemLimit, ct);
    [HttpGet("/api/daily-plans/{date}/signals")]
    public Task<DaySignalsView> Signals(DateOnly date, [FromQuery] bool observeFocus = false, CancellationToken ct = default)
        => signals.SignalsAsync(UserId, date, observeFocus, ct);
    [HttpPost("{id:guid}/move")]
    public async Task<PlanMutation> Move(Guid id, MoveScheduleRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.MoveAsync(UserId, id, new(request.Version, request.ExpectedPlanningVersion!.Value, request.TargetDate!.Value,
            request.StartsAt!.Value, request.EndsAt!.Value, request.AllowConflicts, request.AllowProtectedChange, request.Reason), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpPost, ProducesResponseType(typeof(PlanMutation), 201)]
    public async Task<ActionResult<PlanMutation>> Create(CreateScheduleRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.CreateAsync(UserId, new(request.LocalDate!.Value, request.TaskId, request.Kind!.Value, request.StartsAt!.Value, request.EndsAt!.Value,
            request.IsFixed, request.IsLocked, request.AllowConflicts, request.ExpectedPlanningVersion!.Value, request.Reason, request.DayItemId, request.DayItemVersion), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return Created($"/api/schedules/{result.Values.Schedules[0].Id}", result.Values);
    }
    [HttpPut("{id:guid}")]
    public async Task<PlanMutation> Update(Guid id, UpdateScheduleRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ChangeAsync(UserId, id, new(request.Version, request.ExpectedPlanningVersion!.Value, request.StartsAt!.Value, request.EndsAt!.Value, request.IsFixed, request.IsLocked,
            request.AllowConflicts, request.AllowProtectedChange, request.Reason), false, key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpPost("{id:guid}/remove")]
    public async Task<PlanMutation> Remove(Guid id, RemoveScheduleRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ChangeAsync(UserId, id, new(request.Version, request.ExpectedPlanningVersion!.Value, default, default, false, false, false, request.AllowProtectedChange, request.Reason), true, key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpGet("{id:guid}")] public Task<ScheduleView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet] public Task<SchedulePage> List([FromQuery] ScheduleRange query, CancellationToken ct) => service.ListAsync(UserId, query.From!.Value, query.To!.Value, query.Offset, query.Limit, ct);
    [HttpGet("/api/daily-plans/{date}/revisions")] public Task<RevisionPage> Revisions(DateOnly date, [FromQuery] PlanPageQuery query, CancellationToken ct) => service.RevisionsAsync(UserId, date, query.Offset, query.Limit, ct);
    [HttpGet("/api/plan-revisions/{id:guid}")] public Task<RevisionView> Revision(Guid id, CancellationToken ct) => service.RevisionAsync(UserId, id, ct);
    [HttpGet("/api/plan-revisions/{id:guid}/items")] public Task<RevisionItemPage> Items(Guid id, [FromQuery] PlanPageQuery query, CancellationToken ct) => service.ItemsAsync(UserId, id, query.Offset, query.Limit, ct);
    [HttpGet("/api/plan-revisions/{id:guid}/changes")] public Task<RevisionChangePage> Changes(Guid id, [FromQuery] PlanPageQuery query, CancellationToken ct) => service.ChangesAsync(UserId, id, query.Offset, query.Limit, ct);
    [HttpGet("/api/tasks/{id:guid}/allocation")] public Task<TaskAllocation> Allocation(Guid id, [FromQuery] ScheduleRange query, CancellationToken ct) => service.AllocationAsync(UserId, id, query.From!.Value, query.To!.Value, ct);
}
public sealed class MoveScheduleRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    [Required] public DateOnly? TargetDate { get; set; }
    [Required] public DateTimeOffset? StartsAt { get; set; }
    [Required] public DateTimeOffset? EndsAt { get; set; }
    public bool AllowConflicts { get; set; }
    public bool AllowProtectedChange { get; set; }
    [StringLength(2000)] public string? Reason { get; set; }
}
public class PlanPageQuery
{
    [Range(0, 100000)] public int Offset { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 50;
}
public sealed class ScheduleRange : PlanPageQuery
{
    [Required] public DateTimeOffset? From { get; set; }
    [Required] public DateTimeOffset? To { get; set; }
}
public sealed class CreateScheduleRequest
{
    [Required] public DateOnly? LocalDate { get; set; }
    public Guid? TaskId { get; set; }
    [Required] public ScheduleKind? Kind { get; set; }
    [Required] public DateTimeOffset? StartsAt { get; set; }
    [Required] public DateTimeOffset? EndsAt { get; set; }
    public bool IsFixed { get; set; }
    public bool IsLocked { get; set; }
    public bool AllowConflicts { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    [StringLength(2000)] public string? Reason { get; set; }
    // Saatsiz öğeye saat ver. Aynı işlemde saatsiz listeden çıkar.
    public Guid? DayItemId { get; set; }
    [Range(1, long.MaxValue)] public long? DayItemVersion { get; set; }
}
public sealed class UpdateScheduleRequest : RemoveScheduleRequest
{
    [Required] public DateTimeOffset? StartsAt { get; set; }
    [Required] public DateTimeOffset? EndsAt { get; set; }
    public bool IsFixed { get; set; }
    public bool IsLocked { get; set; }
    public bool AllowConflicts { get; set; }
}
public class RemoveScheduleRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public bool AllowProtectedChange { get; set; }
    [StringLength(2000)] public string? Reason { get; set; }
}

public sealed class DayOverviewQuery
{
    [Range(0, 100000)] public int ScheduleOffset { get; set; }
    [Range(1, 100)] public int ScheduleLimit { get; set; } = 100;
    [Range(0, 100000)] public int ItemOffset { get; set; }
    [Range(1, 100)] public int ItemLimit { get; set; } = 100;
}
