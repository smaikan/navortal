using System.Collections.Concurrent;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using System.Security.Cryptography;

namespace Adhd.IntegrationTests;

public sealed class PushDeliveryTests
{
    [Fact]
    public async Task PushPayloadCarriesSnoozeRoundWithoutChangingNotificationOrRecipientIdentity()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(EnableTransport); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/ui27"));
        var at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Su içmeyi hatırla", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        var first = Assert.Single(sender.Sent); Assert.Equal(0, first.SnoozeCount); Assert.Equal(s.User.UserId, first.RecipientUserId);
        Assert.Equal("Su içmeyi hatırla", first.Title); Assert.Equal("Hatırlatma", first.Body);
        var notification = Assert.Single((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items);
        var snoozed = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{notification.Id}/snooze", new { version = notification.Version, seconds = 60 }));
        s.App.Clock.Now = at.AddMinutes(1); await s.Pump(); var second = sender.Sent.Last(); Assert.Equal(2, sender.Sent.Count);
        Assert.Equal(first.NotificationId, second.NotificationId); Assert.Equal(first.RecipientUserId, second.RecipientUserId); Assert.Equal(first.Tag, second.Tag);
        Assert.Equal(snoozed.SnoozeCount, second.SnoozeCount); Assert.Equal(1, second.SnoozeCount); Assert.Equal(first.Title, second.Title); Assert.Equal(first.Body, second.Body);
    }
    [Fact]
    public async Task RetryUsesStableIdentityAcknowledgementReplayDoesNotSendAgainAndGoneSubscriptionIsDeactivated()
    {
        var sender = new FakePush(); sender.Results.Enqueue(new(429, TimeSpan.FromSeconds(30))); sender.Results.Enqueue(new(201));
        await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(EnableTransport); });
        await Enable(s.User); var sub = await TaskScenario.Read<SubscriptionView>(await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/a")));
        var at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Göz molası ver", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        Assert.Single(sender.Sent); s.App.Clock.Now = at.AddSeconds(30); await s.Pump(); Assert.Equal(2, sender.Sent.Count); var sent = sender.Sent.ToArray(); Assert.Equal(sent[0], sent[1]); Assert.Equal("Hatırlatma", sent[1].Body); Assert.Equal("Göz molası ver", sent[1].Title);
        await using var db = s.Context(); var delivery = await db.PushDeliveries.AsNoTracking().SingleAsync(); Assert.Equal(DeliveryState.Succeeded, delivery.State);
        var message = await db.Outbox.SingleAsync(x => x.Kind == "PushDelivery"); message.State = Adhd.Domain.Jobs.OutboxState.Pending; message.CompletedAt = null; await db.SaveChangesAsync(); await s.Pump(); Assert.Equal(2, sender.Sent.Count);
        sender.Results.Enqueue(new(410)); at = s.App.Clock.Now.AddMinutes(1); await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Next", dueAt = at }); s.App.Clock.Now = at; await s.Pump();
        Assert.False((await db.PushSubscriptions.AsNoTracking().SingleAsync(x => x.Id == sub.Id)).Active); Assert.Equal(1, await db.PushDeliveries.CountAsync(x => x.State == DeliveryState.InvalidSubscription));
    }
    [Fact]
    public async Task SourceCanceledAfterPreparationAndBeforeDeliveryPreventsExternalSend()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(EnableTransport); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/b"));
        var at = s.App.Clock.Now.AddMinutes(1); var reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Soon", dueAt = at }));
        s.App.Clock.Now = at; var claims = await s.Claim(); foreach (var c in claims) await s.Effect(c); // Ready teslim satırını kaydetti. Kuyruk henüz bildirimi göndermedi.
        await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{reminder.Id}/cancel", new { version = reminder.Version }); await s.Pump(); Assert.Empty(sender.Sent);
        await using var db = s.Context(); Assert.Equal(DeliveryState.Obsolete, (await db.PushDeliveries.SingleAsync()).State);
    }
    [Fact]
    public async Task MissingLegacySnapshotUsesSourceNameAndRenamingOnlySendsTheNewVersion()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(EnableTransport); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/reminder-title"));
        var at = s.App.Clock.Now.AddMinutes(1);
        var reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "İlk ad", dueAt = at }));
        await using (var db = s.Context()) { var intent = await db.NotificationIntents.SingleAsync(); intent.Title = null; await db.SaveChangesAsync(); }
        s.App.Clock.Now = at; await s.Pump(); Assert.Equal("İlk ad", Assert.Single(sender.Sent).Title);
        var next = s.App.Clock.Now.AddMinutes(1);
        reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Put, $"/api/notifications/reminders/{reminder.Id}", new { title = "Gönderilmeyecek eski ad", dueAt = next, version = reminder.Version }));
        s.App.Clock.Now = next; foreach (var claim in await s.Claim()) await s.Effect(claim);
        var final = s.App.Clock.Now.AddMinutes(1);
        await ManualPlanningTests.Send(s.User, HttpMethod.Put, $"/api/notifications/reminders/{reminder.Id}", new { title = "Yeni ad", dueAt = final, version = reminder.Version });
        await s.Pump(); Assert.Single(sender.Sent);
        s.App.Clock.Now = final; await s.Pump();
        Assert.Equal(new[] { "İlk ad", "Yeni ad" }, sender.Sent.Select(x => x.Title).ToArray());
    }
    [Fact]
    public async Task FocusSpecificSoundPreferenceSilencesBothForegroundAlertsAndPush()
    {
        var sender = new FakePush(); await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(EnableTransport); });
        await Enable(s.User); await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/focus-sound"));
        var focus = await FocusTests.Start(s.User, null, new(60, 60, SoundEnabled: false));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        focus = await TaskScenario.Read<Adhd.Application.Focus.FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}")); await s.Pump();
        Assert.True(Assert.Single(sender.Sent).Silent);
        Assert.Equal("Pomodoro süresi doldu", Assert.Single(sender.Sent).Title); Assert.Equal("Molaya geçebilir veya çalışmaya devam edebilirsin.", Assert.Single(sender.Sent).Body);
        var alerts = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        Assert.False(Assert.Single(alerts.Items).SoundEnabled);
        focus = await TaskScenario.Read<Adhd.Application.Focus.FocusView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, $"/api/focus-sessions/{focus.Id}/break", new { version = focus.Version, workSessionVersion = focus.WorkSessionVersion }));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        _ = await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}"); await s.Pump();
        var breakAlert = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        Assert.Contains(breakAlert.Items, x => x.Kind == "BreakEnd" && !x.SoundEnabled);
        Assert.All(sender.Sent, x => Assert.True(x.Silent));
        Assert.Contains(sender.Sent, x => x.Title == "Mola bitti" && x.Body == "Yeni bir pomodoroya başlayabilirsin.");
    }
    internal static void EnableTransport(PushSettings options)
    {
        using var signing = ECDsa.Create(ECCurve.NamedCurves.nistP256); var key = signing.ExportParameters(true);
        options.Enabled = true; options.Subject = "mailto:push@example.test";
        options.PublicKey = NotificationTests.Base64(new byte[] { 4 }.Concat(key.Q.X!).Concat(key.Q.Y!).ToArray()); options.PrivateKey = NotificationTests.Base64(key.D!);
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
