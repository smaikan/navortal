using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Adhd.IntegrationTests;

public sealed class MobilePushTests
{
    private sealed class FakeFcm : IFcmTransport
    {
        public bool Available { get; set; } = true;
        public ConcurrentQueue<IReadOnlyDictionary<string, string>> Sent { get; } = new();
        public ConcurrentQueue<FcmSendResult> Results { get; } = new();
        public Func<Task>? BeforeReturn { get; set; }
        public async Task<FcmSendResult> SendAsync(string token, IReadOnlyDictionary<string, string> data, TimeSpan ttl, CancellationToken ct)
        {
            Sent.Enqueue(data); if (BeforeReturn is not null) await BeforeReturn();
            return Results.TryDequeue(out var result) ? result : new(200);
        }
    }
    private sealed class FakeWeb : IPushTransport
    {
        public ConcurrentQueue<PushEnvelope> Sent { get; } = new();
        public Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct)
        { Sent.Enqueue(envelope); return Task.FromResult(new PushSendResult(201)); }
    }
    private static Task<JobScenario> Scenario(FakeFcm fcm, FakeWeb? web = null) => JobScenario.Create(services =>
    {
        services.RemoveAll<IFcmTransport>(); services.AddSingleton<IFcmTransport>(fcm);
        if (web is not null)
        {
            services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(web);
            services.PostConfigure<PushSettings>(PushDeliveryTests.EnableTransport);
        }
    });
    private static HttpClient Cookie(JobScenario s, TaskScenario? user = null)
    {
        var client = s.App.CreateClient();
        client.DefaultRequestHeaders.Add("Cookie", "adhd_session=" + (user ?? s.User).Client.DefaultRequestHeaders.Authorization!.Parameter);
        client.DefaultRequestHeaders.Add("Origin", "http://localhost"); client.DefaultRequestHeaders.Add("X-ADHD-CSRF", "1");
        return client;
    }
    private static RegisterMobilePushDevice Device(Guid user, long sequence = 1, long binding = 0, string token = "synthetic-fcm-test-token") => new()
    { ExpectedUserId = user, FcmToken = token, ClientSequence = sequence, BindingVersion = binding, AppVersion = "1.0", BuildNumber = 1, OsVersion = "12", Permission = "granted", RemindersChannelEnabled = true };
    private static async Task<HttpResponseMessage> Write(HttpClient client, HttpMethod method, string path, object body, string? key = null)
    {
        using var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString("N"));
        return await client.SendAsync(request);
    }
    private static async Task<MobilePushDeviceView> Register(HttpClient client, Guid installation, RegisterMobilePushDevice body, string? key = null) =>
        await TaskScenario.Read<MobilePushDeviceView>(await Write(client, HttpMethod.Put, "/api/mobile/push/devices/" + installation, body, key));
    private static async Task Ready(JobScenario s)
    {
        var at = s.App.Clock.Now.AddSeconds(30);
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Toplantı notlarını hazırla", dueAt = at });
        s.App.Clock.Now = at; await s.Pump();
    }
    private static async Task EnableWeb(JobScenario s)
    {
        Assert.True((await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, new(PushEnabled: true)))).IsSuccessStatusCode);
        Assert.True((await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/fcm-fallback"))).IsSuccessStatusCode);
    }

    [Fact]
    public async Task CookieCsrfOriginAndOwnerAreRequiredAndBearerIsNotAccepted()
    {
        await using var s = await Scenario(new()); var installation = Guid.NewGuid(); var path = "/api/mobile/push/devices/" + installation;
        using var browser = Cookie(s);
        browser.DefaultRequestHeaders.Remove("X-ADHD-CSRF");
        Assert.Equal(HttpStatusCode.Forbidden, (await Write(browser, HttpMethod.Put, path, Device(s.User.UserId))).StatusCode);
        browser.DefaultRequestHeaders.Add("X-ADHD-CSRF", "1"); browser.DefaultRequestHeaders.Remove("Origin"); browser.DefaultRequestHeaders.Add("Origin", "https://other.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await Write(browser, HttpMethod.Put, path, Device(s.User.UserId))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Write(s.User.Client, HttpMethod.Put, path, Device(s.User.UserId))).StatusCode);
        browser.DefaultRequestHeaders.Remove("Origin"); browser.DefaultRequestHeaders.Add("Origin", "http://localhost");
        Assert.Equal(HttpStatusCode.NotFound, (await Write(browser, HttpMethod.Put, path, Device(Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Write(browser, HttpMethod.Put, path, Device(s.User.UserId))).StatusCode);
    }

    [Fact]
    public async Task RegistrationReplayRotationSequenceOwnershipAndStaleRemovalAreSafe()
    {
        await using var s = await Scenario(new()); using var a = Cookie(s); var installation = Guid.NewGuid(); var key = Guid.NewGuid().ToString("N");
        var body = Device(s.User.UserId); var first = await Register(a, installation, body, key);
        Assert.Equal(first, await Register(a, installation, body, key));
        body.AppVersion = "2.0";
        Assert.Equal(HttpStatusCode.Conflict, (await Write(a, HttpMethod.Put, "/api/mobile/push/devices/" + installation, body, key)).StatusCode);
        var rotated = await Register(a, installation, Device(s.User.UserId, 2, first.BindingVersion, "synthetic-rotated-token"));
        Assert.True(rotated.BindingVersion > first.BindingVersion);
        Assert.Equal(HttpStatusCode.Conflict, (await Write(a, HttpMethod.Put, "/api/mobile/push/devices/" + installation, Device(s.User.UserId))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Write(a, HttpMethod.Put, "/api/mobile/push/devices/" + Guid.NewGuid(), Device(s.User.UserId, token: "synthetic-rotated-token"))).StatusCode);
        var secondUser = await TaskScenario.User(s.App); using var b = Cookie(s, secondUser);
        var rebound = await Register(b, installation, Device(secondUser.UserId, 3, rotated.BindingVersion, "synthetic-rotated-token"));
        Assert.True(rebound.BindingVersion > rotated.BindingVersion);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync("/api/mobile/push/devices/" + installation)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Write(a, HttpMethod.Delete, "/api/mobile/push/devices/" + installation,
            new RemoveMobilePushDevice(s.User.UserId, rotated.BindingVersion, 4))).StatusCode);
        await using var db = s.Context(); var row = await db.MobilePushDevices.SingleAsync();
        Assert.Equal(secondUser.UserId, row.UserId); Assert.DoesNotContain("synthetic-rotated-token", row.ProtectedToken!);
        var remove = new RemoveMobilePushDevice(secondUser.UserId, rebound.BindingVersion, 4); var deleteKey = Guid.NewGuid().ToString("N");
        Assert.Equal(HttpStatusCode.NoContent, (await Write(b, HttpMethod.Delete, "/api/mobile/push/devices/" + installation, remove, deleteKey)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Write(b, HttpMethod.Delete, "/api/mobile/push/devices/" + installation, remove, deleteKey)).StatusCode);
    }

    [Fact]
    public async Task ConcurrentRegistrationsAreSerializedAndOnlyOneVersionWins()
    {
        await using var s = await Scenario(new()); using var a = Cookie(s); using var b = Cookie(s); var installation = Guid.NewGuid();
        var results = await Task.WhenAll(Write(a, HttpMethod.Put, "/api/mobile/push/devices/" + installation, Device(s.User.UserId, token: "token-one")),
            Write(b, HttpMethod.Put, "/api/mobile/push/devices/" + installation, Device(s.User.UserId, token: "token-two")));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);
        await using var db = s.Context(); Assert.Equal(1, await db.MobilePushDevices.CountAsync());
    }

    [Fact]
    public async Task MobileDefaultsOnSendsReminderTitleAndTimeAndDoesNotAlsoSendWebPush()
    {
        var fcm = new FakeFcm(); var web = new FakeWeb(); await using var s = await Scenario(fcm, web); using var client = Cookie(s); var installation = Guid.NewGuid();
        var prefs = await TaskScenario.Read<MobilePushPreferencesView>(await client.GetAsync("/api/mobile/push/preferences")); Assert.True(prefs.Enabled);
        await EnableWeb(s); var device = await Register(client, installation, Device(s.User.UserId)); await Ready(s);
        var payload = Assert.Single(fcm.Sent); Assert.Empty(web.Sent);
        Assert.Equal("Toplantı notlarını hazırla", payload["title"]); Assert.StartsWith("Hatırlatma saati ", payload["body"]); Assert.Equal("reminders-v1", payload["channelId"]);
        Assert.Equal("/notifications/" + payload["notificationId"], payload["path"]); Assert.Equal(16, payload.Count);
        var delivery = Guid.Parse(payload["deliveryId"]);
        var display = await TaskScenario.Read<MobilePushDisplayView>(await client.GetAsync($"/api/mobile/push/deliveries/{delivery}?installationId={installation}&bindingVersion={device.BindingVersion}"));
        Assert.True(display.DisplayAllowed);
        var receipt = new MobilePushReceipt(s.User.UserId, installation, device.BindingVersion, 0, "Displayed");
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/mobile/push/deliveries/{delivery}/receipts", receipt)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/mobile/push/deliveries/{delivery}/receipts", receipt)).StatusCode);
        await using var db = s.Context(); var n = await db.NotificationIntents.SingleAsync(); Assert.Null(n.ReadAt);
        Assert.NotNull((await db.MobilePushDeliveries.SingleAsync()).DisplayedAt);
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version });
        display = await TaskScenario.Read<MobilePushDisplayView>(await client.GetAsync($"/api/mobile/push/deliveries/{delivery}?installationId={installation}&bindingVersion={device.BindingVersion}"));
        Assert.False(display.DisplayAllowed); Assert.Equal("read", display.Reason);
        var status = await TaskScenario.Read<NotificationDeliveryStatus>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}/delivery-status"));
        Assert.NotNull(status.ProviderAcceptedAt); Assert.NotNull(status.ClientDisplayedAt);
    }

    [Theory]
    [InlineData("no-device")]
    [InlineData("disabled")]
    [InlineData("permission")]
    [InlineData("unavailable")]
    [InlineData("logout")]
    public async Task IneligibleMobileTargetsPreserveWebPush(string mode)
    {
        var fcm = new FakeFcm(); var web = new FakeWeb(); await using var s = await Scenario(fcm, web); using var client = Cookie(s); await EnableWeb(s);
        if (mode != "no-device")
        {
            var body = Device(s.User.UserId); if (mode == "permission") body.Permission = "denied";
            await Register(client, Guid.NewGuid(), body);
        }
        if (mode == "disabled") Assert.True((await Write(client, HttpMethod.Put, "/api/mobile/push/preferences", new UpdateMobilePushPreferences(s.User.UserId, 0, false))).IsSuccessStatusCode);
        if (mode == "unavailable") fcm.Available = false;
        if (mode == "logout")
        {
            // Revoke this native cookie session; create a new independent session for reminder creation.
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
            await using var scope = s.App.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<Adhd.Infrastructure.Persistence.PlannerDbContext>(); Assert.False((await db.MobilePushDevices.SingleAsync()).Active);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/mobile/push/preferences")).StatusCode);
            var n = new Adhd.Domain.Jobs.NotificationIntent { Id = Guid.CreateVersion7(), UserId = s.User.UserId, Kind = "Custom", SourceKey = "test-logout", SourceId = Guid.CreateVersion7(), SourceVersion = 1, OccurredAt = s.App.Clock.Now, CreatedAt = s.App.Clock.Now };
            db.CustomReminders.Add(new() { Id = n.SourceId, UserId = s.User.UserId, Title = "Test", DueAt = n.OccurredAt }); db.NotificationIntents.Add(n);
            db.SuppressOutboxCapture = false; await db.SaveChangesAsync(); await s.Pump();
        }
        else await Ready(s);
        Assert.Empty(fcm.Sent); Assert.Single(web.Sent);
    }

    [Theory]
    [InlineData(404, "fcm_unregistered", true)]
    [InlineData(400, "fcm_invalid_argument", true)]
    [InlineData(403, "fcm_sender_mismatch", false)]
    public async Task DefinitiveRejectionFallsBackExactlyOnceAndOnlyInvalidTokensAreRemoved(int status, string code, bool invalid)
    {
        var fcm = new FakeFcm(); fcm.Results.Enqueue(new(status, code, invalid, true)); var web = new FakeWeb();
        await using var s = await Scenario(fcm, web); using var client = Cookie(s); await EnableWeb(s); await Register(client, Guid.NewGuid(), Device(s.User.UserId)); await Ready(s);
        Assert.Single(fcm.Sent); Assert.Single(web.Sent); await s.Pump(); Assert.Single(web.Sent);
        await using var db = s.Context(); Assert.Equal("Web", (await db.MobilePushRoutes.SingleAsync()).Channel);
        Assert.Equal(!invalid, (await db.MobilePushDevices.SingleAsync()).Active);
    }

    [Fact]
    public async Task AmbiguousOutcomeNeverFallsBackOrResendsAndExpirySuppressesDisplay()
    {
        var fcm = new FakeFcm(); fcm.Results.Enqueue(new(0, "send_outcome_unknown")); var web = new FakeWeb();
        await using var s = await Scenario(fcm, web); using var client = Cookie(s); await EnableWeb(s); var installation = Guid.NewGuid();
        var device = await Register(client, installation, Device(s.User.UserId)); await Ready(s); await s.Pump();
        var p = Assert.Single(fcm.Sent); Assert.Empty(web.Sent);
        await using var db = s.Context(); Assert.Equal(MobilePushDeliveryState.Unknown, (await db.MobilePushDeliveries.SingleAsync()).State);
        s.App.Clock.Now += TimeSpan.FromMinutes(3);
        var result = await TaskScenario.Read<MobilePushDisplayView>(await client.GetAsync($"/api/mobile/push/deliveries/{p["deliveryId"]}?installationId={installation}&bindingVersion={device.BindingVersion}"));
        Assert.False(result.DisplayAllowed); Assert.Equal("expired", result.Reason);
    }

    [Fact]
    public async Task RetryIsStableAndLateInvalidTokenResponseCannotDeleteRotatedToken()
    {
        var fcm = new FakeFcm(); fcm.Results.Enqueue(new(429, "fcm_quota", RetryAfter: TimeSpan.FromSeconds(5))); fcm.Results.Enqueue(new(404, "fcm_unregistered", true, true));
        await using var s = await Scenario(fcm); using var client = Cookie(s); var installation = Guid.NewGuid();
        var first = await Register(client, installation, Device(s.User.UserId)); await Ready(s); Assert.Single(fcm.Sent);
        fcm.BeforeReturn = async () => { await Register(client, installation, Device(s.User.UserId, 2, first.BindingVersion, "rotated-during-send")); };
        s.App.Clock.Now += TimeSpan.FromSeconds(5); await s.Pump();
        Assert.Equal(2, fcm.Sent.Count); Assert.Equal(fcm.Sent.First()["deliveryId"], fcm.Sent.Last()["deliveryId"]);
        await using var db = s.Context(); Assert.True((await db.MobilePushDevices.SingleAsync()).Active);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task MissingServiceAccountAlwaysDisablesFcmWithoutReadingAKey(bool enabled)
    {
        var source = new FcmAccessTokenSource(Options.Create(new FirebaseSettings { Enabled = enabled, ServiceAccountPath = "/nonexistent/mobile-push-test-key.json" }));
        Assert.False(source.Available); await Task.CompletedTask;
    }

    [Theory]
    [InlineData("read")]
    [InlineData("cancel")]
    [InlineData("permission")]
    public async Task ChangesBetweenPreparationAndSendAreRechecked(string change)
    {
        var fcm = new FakeFcm(); var web = new FakeWeb(); await using var s = await Scenario(fcm, web); using var client = Cookie(s);
        await EnableWeb(s); var installation = Guid.NewGuid(); var device = await Register(client, installation, Device(s.User.UserId));
        var at = s.App.Clock.Now.AddMinutes(1);
        var reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Test", dueAt = at }));
        s.App.Clock.Now = at; foreach (var claim in await s.Claim()) await s.Effect(claim);
        if (change == "permission")
        {
            var body = Device(s.User.UserId, 2, device.BindingVersion); body.Permission = "denied"; await Register(client, installation, body);
        }
        else if (change == "cancel") await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{reminder.Id}/cancel", new { version = reminder.Version });
        else
        {
            await using var db = s.Context(); var n = await db.NotificationIntents.SingleAsync();
            await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version });
        }
        await s.Pump(); Assert.Empty(fcm.Sent);
        if (change == "permission") Assert.Single(web.Sent); else Assert.Empty(web.Sent);
    }

    [Fact]
    public async Task OldAccountCannotResolveOrAcknowledgeAfterAccountSwitch()
    {
        var fcm = new FakeFcm(); await using var s = await Scenario(fcm); using var a = Cookie(s); var installation = Guid.NewGuid();
        var device = await Register(a, installation, Device(s.User.UserId)); await Ready(s); var payload = Assert.Single(fcm.Sent);
        var bUser = await TaskScenario.User(s.App); using var b = Cookie(s, bUser);
        await Register(b, installation, Device(bUser.UserId, 2, device.BindingVersion));
        var path = $"/api/mobile/push/deliveries/{payload["deliveryId"]}?installationId={installation}&bindingVersion={device.BindingVersion}";
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync($"/api/mobile/push/deliveries/{payload["deliveryId"]}/receipts",
            new MobilePushReceipt(s.User.UserId, installation, device.BindingVersion, 0, "Opened"))).StatusCode);
    }

    [Fact]
    public async Task MissingFieldsFailValidationAndMobileRateLimitHasRetryAfter()
    {
        await using var s = await Scenario(new()); using var client = Cookie(s);
        Assert.Equal(HttpStatusCode.BadRequest, (await Write(client, HttpMethod.Put, "/api/mobile/push/preferences", new { expectedUserId = s.User.UserId, version = 0 })).StatusCode);
        using var anonymous = s.App.CreateClient(); HttpResponseMessage? last = null;
        for (var i = 0; i < 61; i++) { last?.Dispose(); last = await anonymous.GetAsync("/api/mobile/push/preferences"); }
        using (last)
        {
            Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode); Assert.NotNull(last.Headers.RetryAfter);
            using var json = JsonDocument.Parse(await last.Content.ReadAsStringAsync()); Assert.Equal("mobile_rate_limited", json.RootElement.GetProperty("code").GetString());
        }
    }

    [Fact]
    public async Task DisplayAuthorizationPreservesTheExistingSoundPreference()
    {
        var fcm = new FakeFcm(); await using var s = await Scenario(fcm); using var client = Cookie(s); var installation = Guid.NewGuid();
        Assert.True((await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, new(SoundEnabled: false)))).IsSuccessStatusCode);
        var device = await Register(client, installation, Device(s.User.UserId)); await Ready(s); var p = Assert.Single(fcm.Sent);
        var display = await TaskScenario.Read<MobilePushDisplayView>(await client.GetAsync($"/api/mobile/push/deliveries/{p["deliveryId"]}?installationId={installation}&bindingVersion={device.BindingVersion}"));
        Assert.True(display.DisplayAllowed); Assert.True(display.Silent);
    }

    [Fact]
    public async Task MigrationUpgradePreservesExistingWebSubscriptionsAndDefaultsMobileOn()
    {
        await using var s = await Scenario(new());
        await using (var db = s.Context()) await db.GetService<IMigrator>().MigrateAsync("20261111162940_AddCollectionTaskDetach");
        var web = await TaskScenario.Read<SubscriptionView>(await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions",
            NotificationTests.Subscription("https://push.example.test/pre-fcm-migration")));
        await using (var db = s.Context()) await db.Database.MigrateAsync();
        using var client = Cookie(s);
        var preferences = await TaskScenario.Read<MobilePushPreferencesView>(await client.GetAsync("/api/mobile/push/preferences"));
        Assert.True(preferences.Enabled); Assert.Equal(0, preferences.Version);
        await using var upgraded = s.Context(); var subscription = await upgraded.PushSubscriptions.SingleAsync();
        Assert.Equal(web.Id, subscription.Id); Assert.True(subscription.Active); Assert.Empty(await upgraded.MobilePushDevices.ToArrayAsync());
    }
}
