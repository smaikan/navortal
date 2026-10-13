using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using Adhd.Application.Notifications;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class NotificationTests
{
    private static async Task<NotificationPreferencesView> Configure(TaskScenario s, NotificationSettings settings)
    {
        var current = await TaskScenario.Read<NotificationPreferencesView>(await s.Client.GetAsync("/api/notifications/preferences"));
        var r = await s.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(current.Version, settings)); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<NotificationPreferencesView>(r);
    }
    private static Task<HttpResponseMessage> Reminder(TaskScenario s, DateTimeOffset at, string? key = null, Guid? taskId = null) => Send(s, HttpMethod.Post, "/api/notifications/reminders", new { title = "Hatırlat", dueAt = at, taskId }, key);
    [Fact]
    public async Task CustomReminderIsIdempotentOwnedVersionedAndSnoozeRetainsLogicalIdentity()
    {
        await using var s = await JobScenario.Create(); var now = s.App.Clock.Now; var key = Guid.NewGuid().ToString();
        var first = await TaskScenario.Read<CustomReminderView>(await Reminder(s.User, now.AddMinutes(1), key)); var replay = await TaskScenario.Read<CustomReminderView>(await Reminder(s.User, now.AddMinutes(1), key)); Assert.Equal(first.Id, replay.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Reminder(s.User, now.AddMinutes(2), key)).StatusCode);
        await s.Pump(); s.App.Clock.Now = now.AddMinutes(1); await s.Pump();
        var page = await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications")); var n = Assert.Single(page.Items); Assert.Equal(NotificationIntentState.Ready, n.State); Assert.Equal(first.Title,n.Title);
        var foreign = await TaskScenario.User(s.App); Assert.Equal(HttpStatusCode.NotFound, (await foreign.Client.GetAsync($"/api/notifications/{n.Id}")).StatusCode);
        var snooze = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/snooze", new { version = n.Version, seconds = 60 })); Assert.Equal(1, snooze.SnoozeCount);
        Assert.Equal(HttpStatusCode.Conflict, (await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/snooze", new { version = n.Version })).StatusCode);
        await s.Pump(); Assert.Equal(NotificationIntentState.Pending, (await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}"))).State);
        s.App.Clock.Now = now.AddMinutes(2); await s.Pump(); n = await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}")); Assert.Equal(snooze.Id, n.Id); Assert.Equal(NotificationIntentState.Ready, n.State);
        var read = await s.User.Client.PostAsJsonAsync($"/api/notifications/{n.Id}/read", new { version = n.Version }); Assert.NotNull((await TaskScenario.Read<NotificationView>(read)).ReadAt);
        var updated=await Send(s.User,HttpMethod.Put,$"/api/notifications/reminders/{first.Id}",new{title="Yeni hatırlatma başlığı",dueAt=s.App.Clock.Now.AddMinutes(10),version=first.Version});Assert.True(updated.IsSuccessStatusCode);
        Assert.Equal(first.Title,(await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{n.Id}"))).Title);
        Assert.DoesNotContain((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items,x=>x.Title=="Yeni hatırlatma başlığı");
        Assert.Contains(await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders")),x=>x.Title=="Yeni hatırlatma başlığı");
    }
    [Fact]
    public async Task QuietHoursDeferWithoutBurningAttemptsAndDoNotReplayOldAlarmsInMorning()
    {
        await using var s = await JobScenario.Create(); s.App.Clock.Now = new(2026, 10, 15, 20, 0, 0, TimeSpan.Zero); await Configure(s.User, new(QuietStart: new(22, 0), QuietEnd: new(8, 0)));
        await Reminder(s.User, s.App.Clock.Now.AddMinutes(1)); s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1); await s.Pump();
        await using var db = s.Context(); var deferred = await db.Outbox.AsNoTracking().SingleAsync(x => x.Kind == "NotificationReady"); Assert.Equal(0, deferred.Attempts); Assert.Equal(OutboxState.Pending, deferred.State); Assert.Equal(new DateTimeOffset(2026, 10, 16, 5, 0, 0, TimeSpan.Zero), deferred.AvailableAt);
        s.App.Clock.Now = deferred.AvailableAt; await s.Pump(); Assert.Equal(NotificationIntentState.Expired, (await db.NotificationIntents.AsNoTracking().SingleAsync()).State);
    }
    [Fact]
    public async Task LeadTimeChangesPreserveSourceInstantAndPlanMoveInvalidatesPreparedNotification()
    {
        await using var s = await JobScenario.Create(); var now = s.App.Clock.Now; await Configure(s.User, new(LeadSeconds: 300)); var task = await s.User.Root();
        var plan = await Create(s.User, task.Id, now.AddMinutes(10), now.AddMinutes(40)); await s.Pump(); await using var db = s.Context();
        var reminder = await db.ReminderWork.AsNoTracking().SingleAsync(x => x.Kind == ReminderKind.ScheduleStart); Assert.Equal(now.AddMinutes(5), reminder.DueAt); Assert.Equal(now.AddMinutes(10), reminder.SourceAt);
        await Configure(s.User, new(LeadSeconds: 120)); reminder = await db.ReminderWork.AsNoTracking().SingleAsync(x => x.Kind == ReminderKind.ScheduleStart); Assert.Equal(now.AddMinutes(8), reminder.DueAt);
        s.App.Clock.Now = now.AddMinutes(8); await s.Reminders(); var intent = await db.NotificationIntents.AsNoTracking().SingleAsync(); Assert.Equal(now.AddMinutes(10), intent.OccurredAt);
        await Change(s.User, plan.Schedules[0], start: now.AddMinutes(20), end: now.AddMinutes(50)); await s.Pump();
        Assert.Equal(NotificationIntentState.Obsolete, (await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Id == intent.Id)).State);
    }
    [Fact]
    public async Task DisabledTypeAndCanceledCustomSourceCannotBecomeReady()
    {
        await using var s = await JobScenario.Create(); await Configure(s.User, new(Custom: false)); var at = s.App.Clock.Now.AddMinutes(1);
        var one = await TaskScenario.Read<CustomReminderView>(await Reminder(s.User, at)); var two = await TaskScenario.Read<CustomReminderView>(await Reminder(s.User, at));
        Assert.True((await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{two.Id}/cancel", new { version = two.Version })).IsSuccessStatusCode);
        s.App.Clock.Now = at; await s.Pump(); await using var db = s.Context(); Assert.Equal(NotificationIntentState.Suppressed, (await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.SourceId == one.Id)).State); Assert.Equal(NotificationIntentState.Obsolete, (await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.SourceId == two.Id)).State);
    }
    [Fact]
    public async Task SubscriptionKeysAndEndpointArePrivateOwnedAndInvalidEndpointsAreRejected()
    {
        await using var s = await JobScenario.Create(); var command = Subscription("https://push.example.test/private-endpoint");
        var r = await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", command); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); var text = await r.Content.ReadAsStringAsync(); Assert.DoesNotContain(command.Auth, text); Assert.DoesNotContain(command.Endpoint, text);
        var subscription = await TaskScenario.Read<SubscriptionView>(r); Assert.Equal(subscription.Id, (await TaskScenario.Read<SubscriptionView>(await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", command))).Id);
        var foreign = await TaskScenario.User(s.App); Assert.Equal(HttpStatusCode.Conflict, (await foreign.Client.PostAsJsonAsync("/api/notifications/subscriptions", command)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await foreign.Client.PostAsJsonAsync($"/api/notifications/subscriptions/{subscription.Id}/remove", new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", command with { Endpoint = "https://127.0.0.1/secret" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", command with { Auth = "invalid" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.GetAsync("/api/notifications?limit=101")).StatusCode);
    }
    internal static RegisterSubscription Subscription(string endpoint)
    {
        using var p = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256); var q = p.ExportParameters(false).Q; var key = new byte[65]; key[0] = 4; q.X!.CopyTo(key, 1); q.Y!.CopyTo(key, 33);
        return new(endpoint, Base64(key), Base64(RandomNumberGenerator.GetBytes(16)), "Masaüstü");
    }
    [Fact]
    public async Task FocusTargetAndBreakEndHaveOneIdentityAndReturnReminderDiesWhenWorkResumes()
    {
        await using var s = await JobScenario.Create(); await Configure(s.User, new(ReturnAfterSeconds: 60)); var task = await s.User.Root(); var now = s.App.Clock.Now;
        var focus = await FocusTests.Start(s.User, task.Id, new(60, 60)); s.App.Clock.Now = now.AddMinutes(1);
        focus = await TaskScenario.Read<Adhd.Application.Focus.FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}")); await s.Pump();
        await using var db = s.Context(); var target = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Kind == "FocusTarget"); Assert.Equal(NotificationIntentState.Ready, target.State);
        focus = await TaskScenario.Read<Adhd.Application.Focus.FocusView>(await Send(s.User, HttpMethod.Post, $"/api/focus-sessions/{focus.Id}/break", new { version = focus.Version, workSessionVersion = focus.WorkSessionVersion }));
        await s.Pump(); s.App.Clock.Now = now.AddMinutes(2); focus = await TaskScenario.Read<Adhd.Application.Focus.FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}")); await s.Pump();
        Assert.Equal(1, await db.NotificationIntents.CountAsync(x => x.Kind == "FocusTarget")); Assert.Equal(NotificationIntentState.Ready, (await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Kind == "BreakEnd")).State);
        Assert.False(await db.NotificationIntents.AnyAsync(x => x.Kind == "ReturnToTask"));
        await Send(s.User, HttpMethod.Post, $"/api/focus-sessions/{focus.Id}/next", new { version = focus.Version, workSessionVersion = focus.WorkSessionVersion });
        var work = await TaskScenario.Read<Adhd.Application.Work.WorkView>(await s.User.Client.GetAsync($"/api/work-sessions/{focus.WorkSessionId}")); work = await WorkSessionTests.Change(s.User, work, "pause"); await s.Pump();
        s.App.Clock.Now = now.AddMinutes(3); await s.Pump(); var returning = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Kind == "ReturnToTask");
        // Erteleme yeni bir deneme açar. Devam edilirse bu denemeden önce kaynak sürümü geçersiz olur
        var snoozed = await s.User.Client.PostAsJsonAsync($"/api/notifications/{returning.Id}/snooze", new { version = returning.Version, seconds = 60 }); Assert.True(snoozed.IsSuccessStatusCode, await snoozed.Content.ReadAsStringAsync());
        work = await WorkSessionTests.Change(s.User, work, "resume"); s.App.Clock.Now = now.AddMinutes(4); await s.Pump(); Assert.Equal(NotificationIntentState.Obsolete, (await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Id == returning.Id)).State);
        Assert.Equal(Adhd.Domain.Work.WorkState.Running, work.State);
    }
    internal static string Base64(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
