using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class NotificationAlertTests
{
    [Fact]
    public async Task RecentAlertsAreUnreadOwnedKeysetPagedAndSnoozeStartsANewRound()
    {
        await using var s = await JobScenario.Create(); var due = s.App.Clock.Now.AddMinutes(1);
        for (var i = 0; i < 3; i++) await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = $"Alert {i}", dueAt = due });
        s.App.Clock.Now = due; await s.Pump();
        var first = await Alerts(s.User, "?limit=1"); Assert.Equal(due, first.ServerNow); Assert.Equal(0, first.PreferencesVersion); var firstItem = Assert.Single(first.Items); Assert.NotNull(first.NextCursor);
        var second = await Alerts(s.User, "?limit=1&cursor=" + first.NextCursor); var secondItem = Assert.Single(second.Items); Assert.NotEqual(firstItem.Id, secondItem.Id);
        var third = await Alerts(s.User, "?limit=1&cursor=" + second.NextCursor); Assert.Single(third.Items); Assert.Null(third.NextCursor);
        Assert.Equal(3, new[] { firstItem.Id, secondItem.Id, third.Items[0].Id }.Distinct().Count());
        var foreign = await TaskScenario.User(s.App); Assert.Empty((await Alerts(foreign)).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await foreign.Client.GetAsync("/api/notifications/alerts?cursor=" + first.NextCursor)).StatusCode);
        using var anonymous = s.App.CreateClient(); Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/notifications/alerts")).StatusCode);
        foreach (var query in new[] { "?limit=0", "?limit=51", "?cursor=bad", "?cursor=" + new string('a', 257) })
            Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.GetAsync("/api/notifications/alerts" + query)).StatusCode);
        var read = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{firstItem.Id}/read", new { version = firstItem.Version }));
        Assert.DoesNotContain((await Alerts(s.User)).Items, x => x.Id == firstItem.Id);
        var snoozed = await TaskScenario.Read<NotificationView>(await s.User.Client.PostAsJsonAsync($"/api/notifications/{read.Id}/snooze", new { version = read.Version, seconds = 60 }));
        Assert.Null(snoozed.ReadAt); Assert.DoesNotContain((await Alerts(s.User)).Items, x => x.Id == read.Id);
        s.App.Clock.Now = due.AddMinutes(1); await s.Pump();
        Assert.Contains((await Alerts(s.User)).Items, x => x.Id == read.Id && x.SnoozeCount == 1);
        s.App.Clock.Now = due.AddSeconds(120); Assert.Equal(3, (await Alerts(s.User)).Items.Length);
        s.App.Clock.Now = due.AddSeconds(121); Assert.Single((await Alerts(s.User)).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.User.Client.GetAsync("/api/notifications/alerts?cursor=" + first.NextCursor)).StatusCode);
    }

    [Fact]
    public async Task ReadyInboxHistoryDoesNotBypassCurrentSourceTypeQuietOrGlobalSoundPolicy()
    {
        await using var s = await JobScenario.Create(); var due = s.App.Clock.Now.AddMinutes(1);
        var reminder = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Active", dueAt = due }));
        var canceled = await TaskScenario.Read<CustomReminderView>(await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Canceled after ready", dueAt = due }));
        s.App.Clock.Now = due; await s.Pump();
        await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{canceled.Id}/cancel", new { version = canceled.Version });
        // Eski Ready kaydını bilerek bırak. Temizlik yapılmasa bile kaynak kontrolü bunu yakalamalı.
        await using (var stale = s.Context()) await stale.NotificationIntents.Where(x => x.SourceId == canceled.Id).ExecuteUpdateAsync(x => x.SetProperty(n => n.State, Adhd.Domain.Jobs.NotificationIntentState.Ready));
        var item = Assert.Single((await Alerts(s.User)).Items); Assert.Equal(reminder.Id, item.SourceId); Assert.True(item.SoundEnabled);
        await Set(s.User, new(SoundEnabled: false)); var silent = await Alerts(s.User); Assert.Equal(1, silent.PreferencesVersion); Assert.False(Assert.Single(silent.Items).SoundEnabled);
        await Set(s.User, new(Custom: false)); Assert.Empty((await Alerts(s.User)).Items);
        await Set(s.User, new(Enabled: false)); Assert.Empty((await Alerts(s.User)).Items);
        // Testte İstanbul'da saat 09:01. Ready kaydolmuş olsa da sessiz saat geçerli.
        await Set(s.User, new(QuietStart: new(8, 0), QuietEnd: new(10, 0))); var quiet = await Alerts(s.User); Assert.Equal(4, quiet.PreferencesVersion); Assert.Empty(quiet.Items);
        await Set(s.User, new()); Assert.Single((await Alerts(s.User)).Items);
        await using var db = s.Context(); Assert.Equal(2, await db.NotificationIntents.CountAsync(x => x.State == Adhd.Domain.Jobs.NotificationIntentState.Ready));
        Assert.Equal(0, await db.NotificationIntents.CountAsync(x => x.ReadAt != null)); // Uyarıları okumak geçmişteki kaydı değiştirmez.
    }

    [Fact]
    public async Task CursorKeepsTheFirstPageUpperBoundWhileFreshObservationCanSeeNewArrivals()
    {
        await using var s = await JobScenario.Create(); var due = s.App.Clock.Now.AddMinutes(1);
        for (var i = 0; i < 2; i++) await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = $"First observation {i}", dueAt = due });
        s.App.Clock.Now = due; await s.Pump(); var first = await Alerts(s.User, "?limit=1"); Assert.NotNull(first.NextCursor);
        await Set(s.User, new(SoundEnabled: false));
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Next observation", dueAt = due.AddSeconds(1) });
        s.App.Clock.Now = due.AddSeconds(2); await s.Pump();
        var remaining = await Alerts(s.User, "?limit=1&cursor=" + first.NextCursor); Assert.Single(remaining.Items); Assert.Null(remaining.NextCursor);
        Assert.Equal(0, first.PreferencesVersion); Assert.Equal(1, remaining.PreferencesVersion); Assert.False(remaining.Items[0].SoundEnabled);
        Assert.Equal(due, remaining.Items[0].OccurredAt); Assert.Equal(3, (await Alerts(s.User)).Items.Length);
        // Alarm Ready olduktan sonra görev gizlenebilir. Görevin şu an görünür olup olmadığına bak.
        var task = await s.User.Root();
        await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "Task alert", taskId = task.Id, dueAt = s.App.Clock.Now.AddSeconds(1) });
        s.App.Clock.Now = s.App.Clock.Now.AddSeconds(1); await s.Pump(); Assert.Contains((await Alerts(s.User)).Items, x => x.TaskId == task.Id);
        var current = await s.User.Get(task.Id); var archived = await s.User.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = current.Version }); Assert.True(archived.IsSuccessStatusCode);
        Assert.DoesNotContain((await Alerts(s.User)).Items, x => x.TaskId == task.Id);
    }

    [Fact]
    public async Task FilteredCandidatePageAdvancesAndLeadUsesTheSameServerDueTimeAsDelivery()
    {
        await using var s = await JobScenario.Create(); var due = s.App.Clock.Now.AddMinutes(1);
        for (var i = 0; i < 2; i++) await ManualPlanningTests.Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = $"Candidate {i}", dueAt = due });
        s.App.Clock.Now = due; await s.Pump();
        var first = await Alerts(s.User, "?limit=1"); var item = Assert.Single(first.Items);
        var canceled = await TaskScenario.Read<CustomReminderView[]>(await s.User.Client.GetAsync("/api/notifications/reminders"));
        var source = canceled.Single(x => x.Id == item.SourceId);
        await s.User.Client.PostAsJsonAsync($"/api/notifications/reminders/{source.Id}/cancel", new { version = source.Version });
        await using (var stale = s.Context()) await stale.NotificationIntents.Where(x => x.Id == item.Id).ExecuteUpdateAsync(x => x.SetProperty(n => n.State, Adhd.Domain.Jobs.NotificationIntentState.Ready));
        var filtered = await Alerts(s.User, "?limit=1"); Assert.Empty(filtered.Items); Assert.NotNull(filtered.NextCursor);
        Assert.Single((await Alerts(s.User, "?limit=1&cursor=" + filtered.NextCursor)).Items);
        // Son tarih ileride olsa da uyarı occurredAt eksi LeadSeconds anında uygun olur.
        var task = await s.User.Root();
        await using var db = s.Context(); var row = await db.Tasks.SingleAsync(x => x.Id == task.Id); row.DeadlineAt = due.AddMinutes(1);
        var intent = new Adhd.Domain.Jobs.NotificationIntent { Id = Guid.CreateVersion7(), UserId = s.User.UserId, Kind = "TaskDeadline", SourceId = task.Id, TaskId = task.Id, SourceKey = $"alert-deadline:{task.Id}", SourceVersion = row.Version, OccurredAt = row.DeadlineAt.Value, CreatedAt = due, ReadyAt = due, State = Adhd.Domain.Jobs.NotificationIntentState.Ready };
        db.NotificationIntents.Add(intent); await db.SaveChangesAsync();
        Assert.DoesNotContain((await Alerts(s.User)).Items, x => x.Id == intent.Id);
        await Set(s.User, new(LeadSeconds: 60)); Assert.Contains((await Alerts(s.User)).Items, x => x.Id == intent.Id);
        s.App.Clock.Now = due.AddSeconds(121); Assert.DoesNotContain((await Alerts(s.User)).Items, x => x.Id == intent.Id);
    }
    private static async Task Set(TaskScenario s, NotificationSettings settings)
    {
        var current = await TaskScenario.Read<NotificationPreferencesView>(await s.Client.GetAsync("/api/notifications/preferences"));
        var result = await s.Client.PutAsJsonAsync("/api/notifications/preferences", new UpdateNotificationPreferences(current.Version, settings)); Assert.True(result.IsSuccessStatusCode);
    }
    private static Task<NotificationAlertPage> Alerts(TaskScenario s, string query = "") => Read(s, query);
    private static async Task<NotificationAlertPage> Read(TaskScenario s, string query) => await TaskScenario.Read<NotificationAlertPage>(await s.Client.GetAsync("/api/notifications/alerts" + query));
}
