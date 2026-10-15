using System.ComponentModel.DataAnnotations;
using Adhd.Application.Calendar;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/calendar")]
public sealed class CalendarController(CalendarService service, DistributionService distribution, PlanningService planning) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("days/{date}/defer-preview")]
    public Task<DayDeferralPreview> PreviewDeferral(DateOnly date, DeferDaySelectionRequest request, CancellationToken ct) => planning.PreviewDeferralAsync(UserId, date, request.Command(), ct);
    [HttpPost("days/{date}/defer")]
    public async Task<DayDeferralResult> Defer(DateOnly date, DeferDaySelectionRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await planning.DeferAsync(UserId, date, request.Command(), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return result.Values;
    }
    [HttpPost("days/{date}/pool-batch")]
    public async Task<PlanMutation> PoolMany(DateOnly date, ReturnManyToPoolRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await planning.ReturnManyToPoolAsync(UserId, date, new(request.Tasks.Select(x => new PoolTaskVersion(x.Id!.Value, x.Version)).ToArray(), request.ExpectedPlanningVersion!.Value, request.PoolId!.Value, request.AllowProtectedChange, request.Reason), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return result.Values;
    }
    [HttpGet] public Task<CalendarRangeView> Range([FromQuery] CalendarRangeQuery query, CancellationToken ct) => service.RangeAsync(UserId, query.FromDate!.Value, query.ToDate!.Value, ct);
    [HttpGet("overview")] public Task<CalendarOverviewView> Overview([FromQuery] CalendarRangeQuery query, CancellationToken ct) => service.OverviewAsync(UserId, query.FromDate!.Value, query.ToDate!.Value, ct);
    [HttpGet("items")] public Task<CalendarItemPage> Items([FromQuery] CalendarItemsQuery query, CancellationToken ct) => service.ItemsAsync(UserId, query.FromDate!.Value, query.ToDate!.Value, query.Offset, query.Limit, ct);
    [HttpGet("days/{date}")] public Task<CalendarDayView> Day(DateOnly date, [FromQuery] CalendarDayQuery query, CancellationToken ct) => service.DayAsync(UserId, date, query, ct);
    [HttpPost("days/{date}/carry")]
    public async Task<DistributionPreviewView> Carry(DateOnly date, DistributionRequestDto request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        if (date.Year is < 2 or > 9998 || request.FromDate <= date)
            throw new UseCaseException(ErrorKind.Validation, "carry_date_invalid", "Hedef aralık kaynak günden sonra başlamalı.");
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100) throw new UseCaseException(ErrorKind.Validation, "idempotency_key_required", "Idempotency-Key gerekli; en çok100 karakter.");
        // Gelecekte ayrılmış saatler olduğu yerde kalır. Taşımak için ayrı komut var
        var result = await distribution.PlanAsync(UserId, new(request.FromDate!.Value, request.ToDate!.Value, request.TaskIds, request.ExpectedPlanningVersion), $"carry:{date:yyyyMMdd}:{key}", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpPost("days/{date}/defer-tasks")]
    public async Task<DayDeferralResult> DeferTasks(DateOnly date, DeferTasksRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        if (request.Tasks.Any(t => t is null)) throw new UseCaseException(ErrorKind.Validation, "defer_selection_invalid", "Her seçim bir görev ve hedef tarih içermeli.");
        var result=await planning.DeferTasksAsync(UserId,date,new(request.Tasks.Select(t=>new DeferTaskTarget(t.TaskId!.Value,t.TargetDate!.Value)).ToArray(),request.ExpectedPlanningVersion!.Value),key??"",ct);
        if(result.Replayed)Response.Headers["Idempotent-Replay"]="true";return result.Values;
    }
    [HttpPost("days/{date}/tasks/{id:guid}/pool")]
    public async Task<PlanMutation> Pool(DateOnly date, Guid id, ReturnToPoolRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await planning.ReturnToPoolAsync(UserId, date, id, new(request.Version, request.ExpectedPlanningVersion!.Value, request.PoolId!.Value, request.AllowProtectedChange, request.Reason), key ?? "", ct);
        if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
}
public sealed class ReturnManyToPoolRequest
{
    [Required, MinLength(1), MaxLength(50)] public PoolTaskVersionRequest[] Tasks { get; set; } = [];
    [Required] public Guid? PoolId { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public bool AllowProtectedChange { get; set; }
    [MaxLength(500)] public string? Reason { get; set; }
}
public sealed class DeferTasksRequest
{
    [Required, MinLength(1), MaxLength(50)] public DeferTaskTargetRequest[] Tasks { get; set; }=[];
    [Required, Range(0,long.MaxValue)] public long? ExpectedPlanningVersion {get;set;}
}
public sealed class DeferTaskTargetRequest
{
    [Required] public Guid? TaskId {get;set;}
    [Required] public DateOnly? TargetDate {get;set;}
}
public sealed class PoolTaskVersionRequest
{
    [Required] public Guid? Id { get; set; }
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
public sealed class CalendarRangeQuery
{
    [Required] public DateOnly? FromDate { get; set; }
    [Required] public DateOnly? ToDate { get; set; }
}
public sealed class CalendarItemsQuery
{
    [Required] public DateOnly? FromDate { get; set; }
    [Required] public DateOnly? ToDate { get; set; }
    [Range(0, 100000)] public int Offset { get; set; }
    [Range(1, 500)] public int Limit { get; set; } = 300;
}
public sealed class ReturnToPoolRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    [Required] public Guid? PoolId { get; set; }
    public bool AllowProtectedChange { get; set; }
    [MaxLength(2000)] public string? Reason { get; set; }
}

public sealed class DeferDaySelectionRequest
{
    [Required] public DateOnly? TargetDate { get; set; }
    [Required, MaxLength(50)] public PlanEntryVersionRequest[] Schedules { get; set; } = [];
    [Required, MaxLength(50)] public PlanEntryVersionRequest[] Items { get; set; } = [];
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public bool AllowProtectedChange { get; set; }
    [MaxLength(500)] public string? Reason { get; set; }
    public DeferDaySelection Command() => new(TargetDate!.Value, Schedules.Select(x => new DayItemMoveEntry(x.Id!.Value, x.Version)).ToArray(), Items.Select(x => new DayItemMoveEntry(x.Id!.Value, x.Version)).ToArray(), ExpectedPlanningVersion!.Value, AllowProtectedChange, Reason);
}

public sealed class PlanEntryVersionRequest
{
    [Required] public Guid? Id { get; set; }
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
