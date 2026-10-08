using System.Collections.Concurrent;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class PushDeliveryTests
{
    [Fact]
    public async Task PushPayloadCarriesSnoozeRoundWithoutChangingNotificationOrRecipientIdentity()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(o => o.Enabled = true); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/ui27"));
        var at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Private title stays out of payload", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        var first = Assert.Single(sender.Sent); Assert.Equal(0, first.SnoozeCount); Assert.Equal(s.User.UserId, first.RecipientUserId);
        var notification = Assert.Single((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items);
        var snoozed = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{notification.Id}/snooze", new { version = notification.Version, seconds = 60 }));
        s.App.Clock.Now = at.AddMinutes(1); await s.Pump(); var second = sender.Sent.Last(); Assert.Equal(2, sender.Sent.Count);
        Assert.Equal(first.NotificationId, second.NotificationId); Assert.Equal(first.RecipientUserId, second.RecipientUserId); Assert.Equal(first.Tag, second.Tag);
        Assert.Equal(snoozed.SnoozeCount, second.SnoozeCount); Assert.Equal(1, second.SnoozeCount); Assert.DoesNotContain("Private title", second.Body);
    }
    [Fact]
    public async Task RetryUsesStableIdentityAcknowledgementReplayDoesNotSendAgainAndGoneSubscriptionIsDeactivated()
    {
        var sender = new FakePush(); sender.Results.Enqueue(new(429, TimeSpan.FromSeconds(30))); sender.Results.Enqueue(new(201));
        await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(o => o.Enabled = true); });
        await Enable(s.User); var sub = await TaskScenario.Read<SubscriptionView>(await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/a")));
        var at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Never put this private title in push", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        Assert.Single(sender.Sent); s.App.Clock.Now = at.AddSeconds(30); await s.Pump(); Assert.Equal(2, sender.Sent.Count); var sent = sender.Sent.ToArray(); Assert.Equal(sent[0], sent[1]); Assert.Equal("Bir hatırlatmanız var.", sent[1].Body);
        await using var db = s.Context(); var delivery = await db.PushDeliveries.AsNoTracking().SingleAsync(); Assert.Equal(DeliveryState.Succeeded, delivery.State);
        var message = await db.Outbox.SingleAsync(x => x.Kind == "PushDelivery"); message.State = Adhd.Domain.Jobs.OutboxState.Pending; message.CompletedAt = null; await db.SaveChangesAsync(); await s.Pump(); Assert.Equal(2, sender.Sent.Count);
        sender.Results.Enqueue(new(410)); at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Next", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        Assert.False((await db.PushSubscriptions.AsNoTracking().SingleAsync(x => x.Id == sub.Id)).Active); Assert.Equal(1, await db.PushDeliveries.CountAsync(x => x.State == DeliveryState.InvalidSubscription));
    }
    [Fact]
    public async Task SourceCanceledAfterPreparationAndBeforeDeliveryPreventsExternalSend()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(o => o.Enabled = true); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/b"));
        var at = s.App.Clock.Now.AddMinutes(1); var reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Soon", dueAt = at }));
        s.App.Clock.Now = at; var claims = await s.Claim(); foreach (var c in claims) await s.Effect(c); // Ready teslim satırını kaydetti. Kuyruk henüz bildirimi göndermedi
        await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{reminder.Id}/cancel", new { version = reminder.Version }); await s.Pump(); Assert.Empty(sender.Sent);
        await using var db = s.Context(); Assert.Equal(DeliveryState.Obsolete, (await db.PushDeliveries.SingleAsync()).State);
    }
    private static async Task Enable(TaskScenario s)
    {
        var r = await s.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, new(PushEnabled: true))); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync());
    }
    private sealed class FakePush : IPushTransport
    {
        internal ConcurrentQueue<PushEnvelope> Sent { get; } = new(); internal ConcurrentQueue<PushSendResult> Results { get; } = new();
        public Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct) { Sent.Enqueue(envelope); return Task.FromResult(Results.TryDequeue(out var r) ? r : new(201)); }
    }
}
