using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class ReminderRepeatTests
{
    [Fact]
    public async Task ActiveReminderFilterRunsBeforePagingAndPreservesUnfilteredReconciliationAndWeeklyRules()
    {
        await using var s = await JobScenario.Create(); var now = s.App.Clock.Now;
        var past = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(1), null));
        var boundary = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(2), null));
        var first = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(3), null));
        var second = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(4), null));
        var canceled = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(5), null));
        var weekly = await TaskScenario.Read<CustomReminderView>(await Save(s.User, now.AddMinutes(1), new("UTC", new(6, 1), [4])));
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{canceled.Id}/cancel", new { canceled.Version })).StatusCode);
        var foreign = await TaskScenario.User(s.App); await Save(foreign, now.AddMinutes(3), null);
        s.App.Clock.Now = now.AddMinutes(2);
        var active = await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders?activeOnly=true&limit=100"));
        Assert.Equal(new[] { weekly.Id, first.Id, second.Id }, active.Select(r => r.Id).ToArray());
        for (var offset = 0; offset < active.Length; offset++)
            Assert.Equal(active[offset].Id, Assert.Single(await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync($"/api/notifications/reminders?activeOnly=true&offset={offset}&limit=1"))).Id);
        Assert.Empty(await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders?activeOnly=true&offset=3&limit=1")));
        var all = await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders?limit=100"));
        Assert.Equal(6, all.Length); Assert.Contains(all, r => r.Id == canceled.Id && r.Canceled);
        Assert.Contains(all, r => r.Id == past.Id); Assert.Contains(all, r => r.Id == boundary.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{weekly.Id}/cancel", new { weekly.Version })).StatusCode);
        s.App.Clock.Now = first.DueAt;
        Assert.Equal(second.Id, Assert.Single(await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders?activeOnly=true"))).Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.GetAsync("/api/notifications/reminders?activeOnly=invalid")).StatusCode);
    }

    private static Task<HttpResponseMessage> Save(TaskScenario user, DateTimeOffset at, ReminderRepeat? repeat, string? key = null) =>
        Send(user, HttpMethod.Post, "/api/notifications/reminders", new CustomReminderCommand("Su iç", at, Repeat: repeat), key);
    [Fact]
    public async Task WeeklyReminderSurvivesRestartAndKeepsOneNextOccurrenceWithoutMissedAlarmFlood()
    {
        await using var s = await JobScenario.Create(); var at = s.App.Clock.Now.AddMinutes(1);
        var repeat = new ReminderRepeat("Europe/Istanbul", new(9, 1), [4, 5]);
        var key = Guid.NewGuid().ToString();
        var response = await Save(s.User, at, repeat, key); Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var r = await TaskScenario.Read<CustomReminderView>(response);
        Assert.Equal(r.Id, (await TaskScenario.Read<CustomReminderView>(await Save(s.User, at, repeat with { WeekDays = [5, 4] }, key))).Id);
        await s.Pump(); Assert.Empty((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items);
        await s.Restart(at); await s.Pump();
        await using var db = s.Context();
        var ready = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.State == NotificationIntentState.Ready);
        Assert.Equal(at, ready.OccurredAt);
        var next = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.State == NotificationIntentState.Pending);
        Assert.Equal(at.AddDays(1), next.OccurredAt);
        var ordinary = await TaskScenario.Read<CustomReminderView>(await Save(s.User, at.AddHours(1), null));
        var ordered = await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders"));
        Assert.Equal(ordinary.Id, ordered[0].Id); Assert.Equal(at.AddDays(1), ordered.Single(x => x.Id == r.Id).DueAt);
        var alerts = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        Assert.Equal(ready.Id, Assert.Single(alerts.Items).Id);
        await s.Restart(at.AddDays(15)); await s.Pump();
        Assert.Equal(1, await db.NotificationIntents.CountAsync(x => x.State == NotificationIntentState.Pending));
        next = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.State == NotificationIntentState.Pending);
        Assert.True(next.OccurredAt > s.App.Clock.Now); Assert.Equal(new TimeOnly(9, 1), TimeOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(next.OccurredAt, "Europe/Istanbul").DateTime));
        Assert.Equal(1, await db.NotificationIntents.CountAsync(x => x.State == NotificationIntentState.Ready));
    }
    [Fact]
    public async Task RepeatEditAndCancelInvalidateOldFutureOccurrencesAndRespectOwnerAndVersion()
    {
        await using var s = await JobScenario.Create(); var at = s.App.Clock.Now.AddMinutes(1);
        var r = await TaskScenario.Read<CustomReminderView>(await Save(s.User, at, new("UTC", new(6, 1), [4, 5])));
        s.App.Clock.Now = at; await s.Pump(); var other = await TaskScenario.User(s.App);
        var command = new CustomReminderCommand("Yeni", at.AddMinutes(1), Version: r.Version, Repeat: new("UTC", new(6, 2), [4]));
        Assert.Equal(HttpStatusCode.NotFound, (await Send(other, HttpMethod.Put, $"/api/notifications/reminders/{r.Id}", command)).StatusCode);
        r = await TaskScenario.Read<CustomReminderView>(await Send(s.User, HttpMethod.Put, $"/api/notifications/reminders/{r.Id}", command));
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s.User, HttpMethod.Put, $"/api/notifications/reminders/{r.Id}", command)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{r.Id}/cancel", new { r.Version })).StatusCode);
        s.App.Clock.Now = at.AddDays(10); await s.Pump();
        await using var db = s.Context(); Assert.All(await db.NotificationIntents.ToArrayAsync(), n => Assert.Equal(NotificationIntentState.Obsolete, n.State));
    }
    [Theory]
    [InlineData("UTC", new int[0])]
    [InlineData("UTC", new[] { 1, 1 })]
    [InlineData("UTC", new[] { 7 })]
    [InlineData("unknown/zone", new[] { 1 })]
    public async Task InvalidRepeatIsRejectedBeforeCreatingAnySource(string zone, int[] days)
    {
        await using var s = await JobScenario.Create();
        Assert.Equal(HttpStatusCode.BadRequest, (await Save(s.User, s.App.Clock.Now.AddMinutes(1), new(zone, new(6, 1), days))).StatusCode);
        await using var db = s.Context(); Assert.Empty(await db.CustomReminders.ToArrayAsync());
    }
    [Fact]
    public async Task InboxOmitsScheduleMessagesWhileTheyStillBecomeReadyAndReadAllDoesNotReadFutureOrForeignRows()
    {
        await using var s = await JobScenario.Create(); var at = s.App.Clock.Now.AddMinutes(1); var task = await s.User.Root();
        await Create(s.User, task.Id, at, at.AddMinutes(5));
        await Save(s.User, at, null); await Save(s.User, at.AddMinutes(2), null);
        var other = await TaskScenario.User(s.App); await Save(other, at, null);
        await s.Pump(); s.App.Clock.Now = at; await s.Reminders(); await s.Pump();
        var inbox = await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"));
        Assert.Equal(1, inbox.Total); Assert.Equal("Custom", Assert.Single(inbox.Items).Kind);
        var alerts = await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"));
        Assert.Contains(alerts.Items, n => n.Kind == "ScheduleStart");
        var read = await TaskScenario.Read<ReadAllNotificationsResult>(await s.User.Client.PostAsync("/api/notifications/read-all", null));
        Assert.Equal(2, read.ReadCount);
        await using var db = s.Context(); Assert.All(await db.NotificationIntents.Where(n => n.UserId == s.User.UserId && n.State == NotificationIntentState.Ready).ToArrayAsync(), n => Assert.NotNull(n.ReadAt));
        Assert.Null((await db.NotificationIntents.AsNoTracking().SingleAsync(n => n.UserId == other.UserId)).ReadAt);
        s.App.Clock.Now = at.AddMinutes(2); await s.Pump();
        Assert.Contains((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items, n => n.OccurredAt == s.App.Clock.Now && n.ReadAt == null);
        s.App.Clock.Now = at.AddMinutes(5); await s.Reminders(); await s.Pump();
        Assert.Contains((await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"))).Items, n => n.Kind == "ScheduleEnd");
        Assert.DoesNotContain((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items, n => n.Kind is "ScheduleStart" or "ScheduleEnd");
    }
    [Fact]
    public async Task ManualCompletionDoesNotCreateReadyScheduleOrDeadlineNotifications()
    {
        await using var s = await JobScenario.Create(); var at = s.App.Clock.Now.AddMinutes(1); var task = await s.User.Root();
        await Create(s.User, task.Id, at, at.AddMinutes(1)); await s.Pump();
        await s.User.State(task.Id, TaskAction.Complete); await s.Pump();
        s.App.Clock.Now = at.AddMinutes(1); await s.Reminders(); await s.Pump();
        Assert.Empty((await TaskScenario.Read<NotificationPage>(await s.User.Client.GetAsync("/api/notifications"))).Items);
        Assert.Empty((await TaskScenario.Read<NotificationAlertPage>(await s.User.Client.GetAsync("/api/notifications/alerts"))).Items);
    }
}
