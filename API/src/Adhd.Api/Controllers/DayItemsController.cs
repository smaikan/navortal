using System.ComponentModel.DataAnnotations;
using Adhd.Application.Planning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

// Gün listesindeki saatsiz öğeler görevden bağımsız olarak bitirilebilir.
[ApiController, Authorize, Route("api/day-items")]
public sealed class DayItemsController(PlanningService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("/api/daily-plans/{date}/items")]
    public Task<DayItemPage> List(DateOnly date, [FromQuery] PlanPageQuery query, CancellationToken ct) => service.DayItemsAsync(UserId, date, query.Offset, query.Limit, ct);
    [HttpPost("/api/daily-plans/{date}/items"), ProducesResponseType(typeof(DayItemView), 201)]
    public async Task<ActionResult<DayItemView>> Add(DateOnly date, AddDayItemRequest request, CancellationToken ct)
    {
        var item = await service.AddDayItemAsync(UserId, date, request.TaskId!.Value, ct);
        return Created($"/api/day-items/{item.Id}", item);
    }
    [HttpPost("{id:guid}/complete")] public Task<DayItemView> Complete(Guid id, DayItemVersionRequest request, CancellationToken ct) => service.ChangeDayItemAsync(UserId, id, request.Version, DayItemAction.Complete, ct);
    [HttpPost("{id:guid}/reopen")] public Task<DayItemView> Reopen(Guid id, DayItemVersionRequest request, CancellationToken ct) => service.ChangeDayItemAsync(UserId, id, request.Version, DayItemAction.Reopen, ct);
    [HttpPost("{id:guid}/remove")] public Task<DayItemView> Remove(Guid id, DayItemVersionRequest request, CancellationToken ct) => service.ChangeDayItemAsync(UserId, id, request.Version, DayItemAction.Remove, ct);
    [HttpPost("{id:guid}/move")] public Task<DayItemView> Move(Guid id, MoveDayItemRequest request, CancellationToken ct) => service.MoveDayItemAsync(UserId, id, request.Version, request.TargetDate!.Value, ct);
    [HttpPost("/api/schedules/{id:guid}/complete")] public Task<ScheduleCompletion> CompleteSchedule(Guid id, DayItemVersionRequest request, CancellationToken ct) => service.CompleteScheduleAsync(UserId, id, request.Version, true, ct);
    [HttpPost("/api/schedules/{id:guid}/reopen")] public Task<ScheduleCompletion> ReopenSchedule(Guid id, DayItemVersionRequest request, CancellationToken ct) => service.CompleteScheduleAsync(UserId, id, request.Version, false, ct);
}
public sealed class AddDayItemRequest
{
    [Required] public Guid? TaskId { get; set; }
}
public class DayItemVersionRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
public sealed class MoveDayItemRequest : DayItemVersionRequest
{
    [Required] public DateOnly? TargetDate { get; set; }
}
