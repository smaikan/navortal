using System.ComponentModel.DataAnnotations;
using Adhd.Application.Focus;
using Adhd.Domain.Focus;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/focus-sessions")]
public sealed class FocusController(FocusService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpPost]
    [ProducesResponseType(typeof(FocusView), 201)]
    public async Task<ActionResult<FocusView>> Start(FocusStart request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.StartAsync(UserId, request, key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true";
        return Created($"/api/focus-sessions/{result.Values.Id}", result.Values);
    }
    [HttpPost("{id:guid}/{operation}")]
    public async Task<FocusView> Change(Guid id, string operation, FocusCommand request, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    {
        var result = await service.ChangeAsync(UserId, id, operation, request, key ?? "", ct); if (result.Replayed) Response.Headers["Idempotent-Replay"] = "true"; return result.Values;
    }
    [HttpGet("current")] public Task<FocusCurrent> Current(CancellationToken ct) => service.CurrentAsync(UserId, ct);
    [HttpGet("{id:guid}")] public Task<FocusView> Get(Guid id, CancellationToken ct) => service.GetAsync(UserId, id, ct);
    [HttpGet] public Task<FocusPage> List([FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.ListAsync(UserId, offset, limit, ct);
    [HttpGet("/api/focus-presets")] public Task<FocusPresetPage> Presets([FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => service.PresetsAsync(UserId, offset, limit, ct);
    [HttpPost("/api/focus-presets")]
    [ProducesResponseType(typeof(FocusPresetView), 201)]
    public async Task<ActionResult<FocusPresetView>> CreatePreset(FocusPresetRequest request, CancellationToken ct)
    {
        var view = await service.SavePresetAsync(UserId, null, request.Name, request.Settings!, null, ct); return Created($"/api/focus-presets", view);
    }
    [HttpPut("/api/focus-presets/{id:guid}")] public Task<FocusPresetView> UpdatePreset(Guid id, UpdateFocusPresetRequest request, CancellationToken ct) => service.SavePresetAsync(UserId, id, request.Name, request.Settings!, request.Version, ct);
}
public class FocusPresetRequest
{
    [Required, StringLength(100)] public string Name { get; set; } = "";
    [Required] public FocusSettings? Settings { get; set; }
}
public sealed class UpdateFocusPresetRequest : FocusPresetRequest { [Range(1, long.MaxValue)] public long Version { get; set; } }
