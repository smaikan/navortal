using System.ComponentModel.DataAnnotations;
using Adhd.Application.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Support;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize]
public sealed class PlanEntriesController(IPlanningStore store) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost("/api/daily-plans/{date}/entries")]
    public Task<PlanEntryResult> Add(DateOnly date, AddPlanEntryRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) =>
        store.AddEntryAsync(UserId, date, new(request.TaskId, request.Title, request.ExpectedPlanningVersion!.Value, request.IsUrgent, request.Priority, request.EnergyDemand, request.Scope), key ?? "", ct);
    [HttpPut("/api/day-items/{id:guid}/time")]
    public Task<DayItemView> Time(Guid id, UpdateDayItemTimeRequest request, CancellationToken ct) =>
        store.SetItemTimeAsync(UserId, id, new(request.Version, request.ExpectedPlanningVersion!.Value, request.StartsAt, request.EndsAt), ct);
}
public sealed class AddPlanEntryRequest
{
    public Guid? TaskId { get; set; }
    [StringLength(300)] public string? Title { get; set; }
    [Required, Range(0, long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public bool IsUrgent { get; set; }
    public PlanEntryScope Scope { get; set; } = PlanEntryScope.Single;
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public EnergyLevel? EnergyDemand { get; set; }
}
public sealed class UpdateDayItemTimeRequest
{
    [Range(1,long.MaxValue)] public long Version { get; set; }
    [Required, Range(0,long.MaxValue)] public long? ExpectedPlanningVersion { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
}
