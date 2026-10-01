using System.ComponentModel.DataAnnotations;
using Adhd.Application.Preferences;
using Adhd.Domain.Preferences;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/preferences")]
public sealed class PreferencesController(PreferencesService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet] public Task<PreferencesSnapshot> Get(CancellationToken ct) => service.ReadAsync(UserId, ct);
    [HttpPut] public Task<PreferencesSnapshot> Put(UpdatePreferencesRequest request, CancellationToken ct) => service.WriteAsync(UserId, request.Version, request.Values, ct);
    [HttpGet("working-hours")] public Task<WorkingDay> Day([FromQuery, Required] DateOnly? date, CancellationToken ct) => service.DayAsync(UserId, date!.Value, ct);
}
public sealed class UpdatePreferencesRequest
{
    [Range(0, long.MaxValue)] public long Version { get; set; }
    [Required] public PlanningPreferences Values { get; set; } = null!;
}
