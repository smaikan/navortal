using System.ComponentModel.DataAnnotations;
using Adhd.Application.SpecialDays;
using Adhd.Domain.SpecialDays;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

// Doğum günü, yıldönümü, tatil ve diğer günler kendi tarihinde, istenirse hatırlatmayla görünür.
[ApiController, Authorize, Route("api/special-days")]
public sealed class SpecialDaysController(SpecialDayService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet] public Task<SpecialDayPage> List([FromQuery] SpecialDayPageQuery query, CancellationToken ct) => service.ListAsync(UserId, query.Offset, query.Limit, ct);
    [HttpPost, ProducesResponseType(typeof(SpecialDayView), 201)]
    public async Task<ActionResult<SpecialDayView>> Create(SpecialDayRequest request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var view = await service.CreateAsync(UserId, request.Command(), key ?? "", ct);
        return Created($"/api/special-days/{view.Id}", view);
    }
    [HttpPut("{id:guid}")] public Task<SpecialDayView> Update(Guid id, UpdateSpecialDayRequest request, CancellationToken ct) => service.UpdateAsync(UserId, id, request.Version, request.Command(), ct);
    [HttpPost("{id:guid}/delete")] public Task<SpecialDayView> Delete(Guid id, SpecialDayVersionRequest request, CancellationToken ct) => service.DeleteAsync(UserId, id, request.Version, false, ct);
    [HttpPost("{id:guid}/restore")] public Task<SpecialDayView> Restore(Guid id, SpecialDayVersionRequest request, CancellationToken ct) => service.DeleteAsync(UserId, id, request.Version, true, ct);
    [HttpGet("occurrences")]
    public Task<SpecialDayOccurrencePage> Occurrences([FromQuery, Required] DateOnly? fromDate, [FromQuery, Required] DateOnly? toDate, CancellationToken ct) =>
        service.OccurrencesAsync(UserId, fromDate!.Value, toDate!.Value, ct);
}
public sealed class SpecialDayPageQuery
{
    [Range(0, 100_000)] public int Offset { get; set; }
    [Range(1, 100)] public int Limit { get; set; } = 50;
}
public class SpecialDayRequest
{
    [Required, StringLength(120, MinimumLength = 1)] public string Title { get; set; } = "";
    [Required] public SpecialDayKind? Kind { get; set; }
    [Range(1, 12)] public int Month { get; set; }
    [Range(1, 31)] public int Day { get; set; }
    [Range(1, 9998)] public int? Year { get; set; }
    [Required] public SpecialDayRecurrence? Recurrence { get; set; }
    public bool NonWorking { get; set; }
    public SpecialDayReminder Reminder { get; set; } = SpecialDayReminder.None;
    public SpecialDayCommand Command() => new(Title, Kind!.Value, Month, Day, Year, Recurrence!.Value, NonWorking, Reminder);
}
public sealed class UpdateSpecialDayRequest : SpecialDayRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
public sealed class SpecialDayVersionRequest
{
    [Range(1, long.MaxValue)] public long Version { get; set; }
}
