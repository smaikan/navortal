using Adhd.Application.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Adhd.Api.Controllers;

[ApiController, Authorize, Route("api/notifications")]
public sealed class NotificationsController(INotificationStore store, IOptions<PushSettings> push) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirst("sub")!.Value);
    [HttpGet("preferences")] public Task<NotificationPreferencesView> Preferences(CancellationToken ct) => store.PreferencesAsync(UserId, ct);
    [HttpPut("preferences")] public Task<NotificationPreferencesView> Preferences(UpdateNotificationPreferences command, CancellationToken ct) => store.UpdatePreferencesAsync(UserId, command, ct);
    [HttpGet("push-config")] public PushConfiguration PushConfig() => new(push.Value.Enabled, push.Value.Enabled ? push.Value.PublicKey : null);
    [HttpGet("subscriptions")] public Task<SubscriptionView[]> Subscriptions(CancellationToken ct) => store.SubscriptionsAsync(UserId, ct);
    [HttpPost("subscriptions")] public Task<SubscriptionView> Subscribe(RegisterSubscription command, CancellationToken ct) => store.SubscribeAsync(UserId, command, ct);
    [HttpPost("subscriptions/{id:guid}/remove"), ProducesResponseType(204)] public async Task<IActionResult> Unsubscribe(Guid id, TaskVersionRequest command, CancellationToken ct) { await store.UnsubscribeAsync(UserId, id, command.Version, ct); return NoContent(); }
    [HttpGet] public Task<NotificationPage> List([FromQuery] int offset = 0, [FromQuery] int limit = 50, CancellationToken ct = default) => store.ListAsync(UserId, offset, limit, ct);
    [HttpGet("alerts")] public Task<NotificationAlertPage> Alerts([FromQuery] int limit = 25, [FromQuery] string? cursor = null, CancellationToken ct = default) => store.AlertsAsync(UserId, limit, cursor, ct);
    [HttpPost("read-all")] public Task<ReadAllNotificationsResult> ReadAll(CancellationToken ct) => store.ReadAllAsync(UserId, ct);
    [HttpGet("{id:guid}")] public Task<NotificationView> Get(Guid id, CancellationToken ct) => store.GetAsync(UserId, id, ct);
    [HttpPost("{id:guid}/snooze")] public Task<NotificationView> Snooze(Guid id, SnoozeNotification command, CancellationToken ct) => store.SnoozeAsync(UserId, id, command, ct);
    [HttpPost("{id:guid}/read")] public Task<NotificationView> Read(Guid id, TaskVersionRequest command, CancellationToken ct) => store.ReadAsync(UserId, id, command.Version, ct);
    [HttpGet("reminders")] public Task<CustomReminderView[]> Reminders([FromQuery] int offset = 0, [FromQuery] int limit = 50, [FromQuery] bool activeOnly = false, CancellationToken ct = default) => store.RemindersAsync(UserId, offset, limit, ct, activeOnly);
    [HttpPost("reminders"), ProducesResponseType(typeof(CustomReminderView), 201)] public async Task<ActionResult<CustomReminderView>> CreateReminder(CustomReminderCommand command, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct)
    { var result = await store.SaveReminderAsync(UserId, null, command, key ?? "", ct); return Created($"/api/notifications/reminders", result); }
    [HttpPut("reminders/{id:guid}")] public Task<CustomReminderView> UpdateReminder(Guid id, CustomReminderCommand command, [FromHeader(Name = "Idempotency-Key")] string? key, CancellationToken ct) => store.SaveReminderAsync(UserId, id, command, key ?? "", ct);
    [HttpPost("reminders/{id:guid}/cancel")] public Task<CustomReminderView> CancelReminder(Guid id, TaskVersionRequest command, CancellationToken ct) => store.CancelReminderAsync(UserId, id, command.Version, ct);
}
