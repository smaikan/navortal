using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Domain.Jobs;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class NotificationMobileTests
{
    [Fact]
    public async Task SummaryCountsOlderUnreadAcrossPagesAndUsesTheExactInboxScope()
    {
        await using var s = await JobScenario.Create();
        var foreign = await TaskScenario.User(s.App);
        var now = s.App.Clock.Now;
        await using (var db = s.Context())
        {
            for (var i = 0; i < 115; i++) db.NotificationIntents.Add(Intent(s.User.UserId, now.AddSeconds(-i), read: i < 110));
            db.NotificationIntents.Add(Intent(s.User.UserId, now, "ScheduleStart"));
            db.NotificationIntents.Add(Intent(s.User.UserId, now, "ScheduleEnd"));
            db.NotificationIntents.Add(Intent(s.User.UserId, now, state: NotificationIntentState.Pending));
            db.NotificationIntents.Add(Intent(s.User.UserId, now, state: NotificationIntentState.Obsolete));
            db.NotificationIntents.Add(Intent(foreign.UserId, now));
            await db.SaveChangesAsync();
        }
        var page = await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications?limit=10"));
        Assert.Equal(115, page.Total); Assert.All(page.Items, x => Assert.NotNull(x.ReadAt));
        Assert.Equal(5, (await Summary(s)).UnreadCount);
        var receipt = await TaskScenario.Read<ReadAllNotificationsResult>(await s.User.Client.PostAsync("/api/notifications/read-all", null));
        Assert.Equal(5, receipt.ReadCount); Assert.Equal(0, receipt.Summary.UnreadCount); Assert.Equal(receipt.ReadAt, receipt.Summary.AsOf);
        await using (var db = s.Context())
        {
            Assert.Null((await db.NotificationIntents.SingleAsync(x => x.UserId == foreign.UserId)).ReadAt);
            Assert.All(await db.NotificationIntents.Where(x => x.UserId == s.User.UserId && (x.Kind == "ScheduleStart" || x.Kind == "ScheduleEnd")).ToArrayAsync(), x => Assert.Null(x.ReadAt));
            Assert.All(await db.NotificationIntents.Where(x => x.UserId == s.User.UserId && x.State == NotificationIntentState.Pending).ToArrayAsync(), x => Assert.Null(x.ReadAt));
            db.NotificationIntents.Add(Intent(s.User.UserId, now.AddSeconds(1))); await db.SaveChangesAsync();
        }
        // A new ready event after acknowledgement survives the previous read-all.
        Assert.Equal(1, (await Summary(s)).UnreadCount); Assert.Equal(0, receipt.Summary.UnreadCount);
        Assert.Equal(1, (await TaskScenario.Read<NotificationInboxSummary>(await foreign.Client.GetAsync("/api/notifications/summary"))).UnreadCount);
    }

    [Fact]
    public async Task ConcurrentReadyAndReadAllDoNotLoseNewUnreadEvents()
    {
        await using var s = await JobScenario.Create();
        var due = s.App.Clock.Now.AddMinutes(1);
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Race", dueAt = due });
        s.App.Clock.Now = due;
        var read = s.User.Client.PostAsync("/api/notifications/read-all", null);
        var ready = s.Pump(); await Task.WhenAll(read, ready);
        var receipt = await TaskScenario.Read<ReadAllNotificationsResult>(await read);
        var summary = await Summary(s);
        var n = Assert.Single((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items);
        Assert.Equal(n.ReadAt is null ? 1 : 0, summary.UnreadCount);
        Assert.Equal(1, receipt.ReadCount + summary.UnreadCount);
    }

    [Fact]
    public async Task ReceiptIsOwnerScopedIdempotentAndSeparateFromProviderAcceptanceAndReadState()
    {
        var sender = new FakePush(); await using var s = await PushScenario(sender);
        var n = await Prepare(s); var foreign = await TaskScenario.User(s.App);
        var path = $"/api/notifications/{n.Id}/delivery-receipts";
        var command = new RecordNotificationReceipt(s.User.UserId, 0, NotificationReceiptStage.Displayed);
        Assert.Equal(HttpStatusCode.NotFound, (await Receipt(foreign.Client, path, command)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Receipt(s.User.Client, path, command with { ExpectedUserId = foreign.UserId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Receipt(s.User.Client, path, command with { SnoozeCount = -1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Receipt(s.User.Client, path, command with { SnoozeCount = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.PostAsJsonAsync(path, new { expectedUserId = s.User.UserId, snoozeCount = 0, stage = "Wrong" })).StatusCode);
        var initial = await Status(s, n.Id); Assert.NotNull(initial.PreparedAt); Assert.Null(initial.ProviderAcceptedAt); Assert.Null(initial.ClientDisplayedAt);
        Assert.Equal(HttpStatusCode.NoContent, (await Receipt(s.User.Client, path, command)).StatusCode);
        var first = await Status(s, n.Id); Assert.NotNull(first.ClientDisplayedAt); Assert.Null(first.ProviderAcceptedAt); Assert.Null(first.ClientOpenedAt); Assert.Null(first.ReadAt);
        s.App.Clock.Now = s.App.Clock.Now.AddSeconds(1);
        Assert.Equal(HttpStatusCode.NoContent, (await Receipt(s.User.Client, path, command)).StatusCode);
        Assert.Equal(first.ClientDisplayedAt, (await Status(s, n.Id)).ClientDisplayedAt);
        await Receipt(s.User.Client, path, command with { Stage = NotificationReceiptStage.Opened });
        await s.Pump(); var accepted = await Status(s, n.Id);
        Assert.NotNull(accepted.ProviderAcceptedAt); Assert.NotNull(accepted.ClientOpenedAt); Assert.Null(accepted.ReadAt); Assert.Single(sender.Sent);
        Assert.Equal(n.Version, (await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}"))).Version);
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version });
        Assert.NotNull((await Status(s, n.Id)).ReadAt);
        var read = await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}"));
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/snooze", new { version = read.Version, seconds = 60 });
        var next = await Status(s, n.Id); Assert.Equal(1, next.SnoozeCount); Assert.Null(next.PreparedAt); Assert.Null(next.ClientDisplayedAt); Assert.Null(next.ClientOpenedAt); Assert.Null(next.ReadAt); Assert.Null(next.ProviderAcceptedAt);
        Assert.Equal(HttpStatusCode.NoContent, (await Receipt(s.User.Client, path, command)).StatusCode); // Late old-round receipt never marks new round.
        Assert.Null((await Status(s, n.Id)).ClientDisplayedAt);
        Assert.Equal(HttpStatusCode.NotFound, (await foreign.Client.GetAsync($"/api/notifications/{n.Id}/delivery-status")).StatusCode);
    }

    [Fact]
    public async Task ReceiptRequiresPreparedDeliveryAndCannotInventOneForAnInboxOnlyNotification()
    {
        await using var s = await JobScenario.Create();
        var n = Intent(s.User.UserId, s.App.Clock.Now);
        await using (var db = s.Context()) { db.NotificationIntents.Add(n); await db.SaveChangesAsync(); }
        var response = await Receipt(s.User.Client, $"/api/notifications/{n.Id}/delivery-receipts", new RecordNotificationReceipt(s.User.UserId, 0, NotificationReceiptStage.Displayed));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        await using var verify = s.Context(); Assert.Empty(await verify.NotificationClientReceipts.ToArrayAsync());
    }

    [Fact]
    public async Task CookieReceiptsRequireSameOriginCsrfAndKeepTheServerValidatedOwner()
    {
        var sender = new FakePush(); await using var s = await PushScenario(sender);
        var n = await Prepare(s);
        var me = await s.User.Client.GetFromJsonAsync<Adhd.Application.Auth.UserSummary>("/api/auth/me");
        using var browser = s.App.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { HandleCookies = true });
        Assert.Equal(HttpStatusCode.OK, (await browser.PostAsJsonAsync("/api/auth/session/login", new { email = me!.Email, password = "123456" })).StatusCode);
        var path = $"/api/notifications/{n.Id}/delivery-receipts";
        HttpRequestMessage Request(bool csrf, string origin) {
            var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(new { expectedUserId = s.User.UserId, snoozeCount = 0, stage = "Displayed" }) };
            request.Headers.Add("Origin", origin); if (csrf) request.Headers.Add("X-ADHD-CSRF", "1"); return request;
        }
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Request(false, "http://localhost"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Request(true, "https://evil.example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await browser.SendAsync(Request(true, "http://localhost"))).StatusCode);
        Assert.NotNull((await Status(s, n.Id)).ClientDisplayedAt); Assert.Null((await Status(s, n.Id)).ReadAt);
    }

    [Fact]
    public async Task ReadingBeforeSendCancelsPendingDeliveryButExplicitSnoozeOpensANewRound()
    {
        var sender = new FakePush(); await using var s = await PushScenario(sender);
        var n = await Prepare(s);
        var read = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version }));
        await s.Pump(); Assert.Empty(sender.Sent);
        await using (var db = s.Context()) Assert.Equal(DeliveryState.Obsolete, (await db.PushDeliveries.SingleAsync()).State);
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/snooze", new { version = read.Version, seconds = 60 });
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1); await s.Pump();
        Assert.Equal(1, Assert.Single(sender.Sent).SnoozeCount); Assert.Equal(1, (await Summary(s)).UnreadCount);
    }

    [Fact]
    public async Task ReadSuppressionCanBeActivatedSeparatelyWithoutChangingTheExistingSendPolicy()
    {
        var sender = new FakePush(); await using var s = await PushScenario(sender, suppressRead: false);
        var n = await Prepare(s);
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version });
        await s.Pump(); Assert.Single(sender.Sent);
    }

    [Fact]
    public async Task ReadDuringAnExternalRequestDoesNotFalselyClaimTheInFlightRequestWasCanceled()
    {
        var sender = new FakePush { Hold = true }; await using var s = await PushScenario(sender);
        var n = await Prepare(s); var send = s.Pump(); await sender.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version });
        sender.Release.TrySetResult(); await send;
        var status = await Status(s, n.Id); Assert.NotNull(status.ReadAt); Assert.NotNull(status.ProviderAcceptedAt); Assert.Null(status.ClientDisplayedAt); Assert.Single(sender.Sent);
    }

    private static Task<HttpResponseMessage> Receipt(HttpClient client, string path, RecordNotificationReceipt command) => client.PostAsJsonAsync(path, new { command.ExpectedUserId, command.SnoozeCount, stage = command.Stage.ToString() });
    private static Task<NotificationInboxSummary> Summary(JobScenario s) => Read<NotificationInboxSummary>(s, "/api/notifications/summary");
    private static Task<NotificationDeliveryStatus> Status(JobScenario s, Guid id) => Read<NotificationDeliveryStatus>(s, $"/api/notifications/{id}/delivery-status");
    private static async Task<T> Read<T>(JobScenario s, string path) => await TaskScenario.Read<T>(await s.User.Client.GetAsync(path));
    private static NotificationIntent Intent(Guid owner, DateTimeOffset at, string kind = "Custom", bool read = false, NotificationIntentState state = NotificationIntentState.Ready) => new()
    {
        Id = Guid.CreateVersion7(), UserId = owner, SourceId = Guid.NewGuid(), SourceKey = Guid.NewGuid().ToString(), SourceVersion = 1,
        Kind = kind, State = state, CreatedAt = at, OccurredAt = at, ReadyAt = at, NotBefore = at, ReadAt = read ? at : null
    };
    private static async Task<JobScenario> PushScenario(FakePush sender, bool suppressRead = true)
    {
        var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(options => { PushDeliveryTests.EnableTransport(options); options.SuppressReadDeliveries = suppressRead; }); });
        await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, new(PushEnabled: true)));
        await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/mobile")); return s;
    }
    private static async Task<NotificationView> Prepare(JobScenario s)
    {
        var at = s.App.Clock.Now.AddMinutes(1);
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Mobile", dueAt = at });
        s.App.Clock.Now = at; foreach (var claim in await s.Claim()) await s.Effect(claim);
        return Assert.Single((await Read<NotificationPage>(s, "/api/notifications")).Items);
    }
    private sealed class FakePush : IPushTransport
    {
        internal bool Hold; internal List<PushEnvelope> Sent = [];
        internal TaskCompletionSource Started = new(TaskCreationOptions.RunContinuationsAsynchronously), Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public async Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct)
        {
            Sent.Add(envelope); Started.TrySetResult(); if (Hold) await Release.Task.WaitAsync(TimeSpan.FromSeconds(10), ct); return new(201);
        }
    }
}
