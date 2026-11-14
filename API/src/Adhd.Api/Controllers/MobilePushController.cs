using System.ComponentModel.DataAnnotations;
using Adhd.Api.Auth;
using Adhd.Application.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/mobile/push"), ServiceFilter(typeof(MobilePushCookieFilter)), EnableRateLimiting("mobile-push")]
public sealed class MobilePushController(IMobilePushStore store) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    private Guid SessionId => Guid.Parse(User.FindFirst("sid")!.Value);
    [HttpGet("devices/{installationId:guid}")]
    public Task<MobilePushDeviceView> Device(Guid installationId, CancellationToken ct) => store.GetAsync(UserId, SessionId, installationId, ct);
    [HttpPut("devices/{installationId:guid}")]
    public Task<MobilePushDeviceView> Register(Guid installationId, RegisterMobilePushDevice command,
        [FromHeader(Name = "Idempotency-Key"), Required, StringLength(128, MinimumLength = 1)] string key, CancellationToken ct) =>
        store.RegisterAsync(UserId, SessionId, installationId, command, key, ct);
    [HttpDelete("devices/{installationId:guid}"), ProducesResponseType(204)]
    public async Task<IActionResult> Remove(Guid installationId, RemoveMobilePushDevice command,
        [FromHeader(Name = "Idempotency-Key"), Required, StringLength(128, MinimumLength = 1)] string key, CancellationToken ct)
    { await store.RemoveAsync(UserId, SessionId, installationId, command, key, ct); return NoContent(); }
    [HttpGet("preferences")]
    public Task<MobilePushPreferencesView> Preferences(CancellationToken ct) => store.PreferencesAsync(UserId, ct);
    [HttpPut("preferences")]
    public Task<MobilePushPreferencesView> UpdatePreferences(UpdateMobilePushPreferences command,
        [FromHeader(Name = "Idempotency-Key"), Required, StringLength(128, MinimumLength = 1)] string key, CancellationToken ct) =>
        store.UpdatePreferencesAsync(UserId, command, key, ct);
    [HttpGet("deliveries/{deliveryId:guid}")]
    public Task<MobilePushDisplayView> Delivery(Guid deliveryId, [FromQuery, Required] Guid? installationId,
        [FromQuery, Required, Range(1, long.MaxValue)] long? bindingVersion, CancellationToken ct) =>
        store.DisplayAsync(UserId, SessionId, deliveryId, installationId.GetValueOrDefault(), bindingVersion.GetValueOrDefault(), ct);
    [HttpPost("deliveries/{deliveryId:guid}/receipts"), ProducesResponseType(204)]
    public async Task<IActionResult> Receipt(Guid deliveryId, MobilePushReceipt command, CancellationToken ct)
    { await store.ReceiptAsync(UserId, SessionId, deliveryId, command, ct); return NoContent(); }
}
