using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Application.Focus;
using Adhd.Domain.Focus;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class NotificationSoundTests
{
    [Fact]
    public async Task PreferencesPersistIndependentlyAndRejectStaleInvalidAndForeignWrites()
    {
        await using var s = await JobScenario.Create();
        // Eski JSON kaydını migration veya yeni yazı olmadan varsayılanlarla oku.
        await using (var db = s.Context())
        {
            db.NotificationPreferences.Add(new() { UserId = s.User.UserId, Version = 4, Settings = "{\"soundEnabled\":false}" });
            await db.SaveChangesAsync();
        }
        var before = await Preferences(s.User);
        Assert.Equal(4, before.Version); Assert.False(before.Settings.SoundEnabled);
        Assert.Equal(("bell", "marimba", "digital"), (before.Settings.PomodoroSound, before.Settings.ReminderSound, before.Settings.TaskEndSound));
        var settings = before.Settings with { SoundEnabled = true, PomodoroSound = "glass", ReminderSound = "pulse", TaskEndSound = "marimba" };
        var result = await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(before.Version, settings));
        Assert.Equal(HttpStatusCode.OK, result.StatusCode);
        Assert.Equal(settings, (await Preferences(s.User)).Settings);
        Assert.Equal(HttpStatusCode.Conflict, (await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(before.Version, settings))).StatusCode);
        foreach (var invalid in new[] { settings with { PomodoroSound = "bad" }, settings with { ReminderSound = null! }, settings with { TaskEndSound = "" } })
            Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(5, invalid))).StatusCode);
        Assert.Equal(5, (await Preferences(s.User)).Version);
        var foreign = await TaskScenario.User(s.App);
        Assert.Equal(0, (await Preferences(foreign)).Version);
        Assert.Equal("bell", (await Preferences(foreign)).Settings.PomodoroSound);
        Assert.Equal(HttpStatusCode.Conflict, (await foreign.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(5, settings))).StatusCode);
        Assert.Equal(settings, (await Preferences(s.User)).Settings);
    }

    [Fact]
    public async Task ReadyReadAndPushCarryTheSameSavedSoundAndMutedPolicyStillWins()
    {
        var sender = new Collector();
        await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(PushDeliveryTests.EnableTransport); });
        var settings = new NotificationSettings(PushEnabled: true, ReminderSound: "glass");
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, settings))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/sounds"))).StatusCode);
        var due = s.App.Clock.Now.AddMinutes(1);
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Ses tercihi", dueAt = due });
        s.App.Clock.Now = due; await s.Pump();
        var alerts = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        var alert = Assert.Single(alerts.Items); Assert.Equal("glass", alert.Sound); Assert.True(alert.SoundEnabled);
        var sent = Assert.Single(sender.Sent); Assert.Equal("glass", sent.Sound); Assert.False(sent.Silent);
        var muted = settings with { SoundEnabled = false, ReminderSound = "digital" };
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(1, muted))).StatusCode);
        alerts = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        Assert.Equal("digital", Assert.Single(alerts.Items).Sound); Assert.False(alerts.Items[0].SoundEnabled);
        var next = due.AddMinutes(1);
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Sessiz tercih", dueAt = next });
        s.App.Clock.Now = next; await s.Pump();
        Assert.Equal("digital", sender.Sent.Last().Sound); Assert.True(sender.Sent.Last().Silent);
    }
    [Fact]
    public async Task PlannedEndAndPomodoroPhasesCarryTheirIndependentSoundWithoutCompletingTheTask()
    {
        var sender = new Collector();
        await using var s = await JobScenario.Create(services => { services.RemoveAll<IPushTransport>(); services.AddSingleton<IPushTransport>(sender); services.PostConfigure<PushSettings>(PushDeliveryTests.EnableTransport); });
        var settings = new NotificationSettings(PushEnabled: true, PomodoroSound: "pulse", ReminderSound: "glass", TaskEndSound: "marimba");
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(0, settings))).StatusCode);
        await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/phases"));
        var now = s.App.Clock.Now; var task = await s.User.Root(); await s.User.Define(task.Id, true, 600); var taskState = (await s.User.Get(task.Id)).State;
        await ManualPlanningTests.Create(s.User, task.Id, now.AddMinutes(1), now.AddMinutes(2)); await s.Pump();
        s.App.Clock.Now = now.AddMinutes(1); await s.Reminders(); await s.Pump();
        Assert.Equal("glass", sender.Sent.Last().Sound);
        s.App.Clock.Now = now.AddMinutes(2); await s.Reminders(); await s.Pump();
        var end = sender.Sent.Last(); Assert.Equal("marimba", end.Sound);
        var detail = await TaskScenario.Read<NotificationView>(await s.User.Client.GetAsync($"/api/notifications/{end.NotificationId}"));
        Assert.Equal("ScheduleEnd", detail.Kind); Assert.Equal("marimba", detail.Sound);
        var focus = await FocusTests.Start(s.User, settings: new(60, 60, TargetBehavior: FocusTargetBehavior.AutoBreak));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        focus = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}")); await s.Pump();
        Assert.Equal(FocusState.Break, focus.State); Assert.Equal("pulse", sender.Sent.Last().Sound);
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(1);
        focus = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{focus.Id}")); await s.Pump();
        Assert.Equal(FocusState.AwaitingNext, focus.State); Assert.Equal("pulse", sender.Sent.Last().Sound);
        Assert.Equal(taskState, (await s.User.Get(task.Id)).State);
    }
    private static async Task<NotificationPreferencesView> Preferences(TaskScenario s) => await TaskScenario.Read<NotificationPreferencesView>(await s.Client.GetAsync("/api/notifications/preferences"));
    private sealed class Collector : IPushTransport
    {
        internal ConcurrentQueue<PushEnvelope> Sent { get; } = new();
        public Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct) { Sent.Enqueue(envelope); return Task.FromResult(new PushSendResult(201)); }
    }
}
