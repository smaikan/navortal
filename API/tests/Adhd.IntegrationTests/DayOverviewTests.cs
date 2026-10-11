using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Support;
using Adhd.Application.SpecialDays;
using Adhd.Application.Sync;
using Adhd.Domain.Preferences;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class DayOverviewTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 25, 6, 0, 0, TimeSpan.Zero);
    private static async Task<DayOverviewView> Read(TaskScenario user, string date = "2026-10-25", string query = "")
    {
        var r = await user.Client.GetAsync($"/api/daily-plans/{date}/overview{query}");
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return await TaskScenario.Read<DayOverviewView>(r);
    }
    private static async Task Add(TaskScenario user, Guid task, string date = "2026-10-25")
        => Assert.Equal(HttpStatusCode.Created, (await user.Client.PostAsJsonAsync($"/api/daily-plans/{date}/items", new { taskId = task })).StatusCode);
    private static async Task<WorkspaceSnapshotView> Workspace(TaskScenario user)
        => await TaskScenario.Read<WorkspaceSnapshotView>(await user.Client.GetAsync("/api/workspace/snapshot"));

    [Fact]
    public async Task EmptyReadIsOwnerScopedReadOnlyAndInvalidPagesAreRejected()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        using var anonymous = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/daily-plans/2026-10-25/overview")).StatusCode);
        var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await b.Root("Other owner's plan"); await b.Define(task.Id, true, 60); await Add(b, task.Id);
        var view = await Read(a);
        Assert.Null(view.Day.Id); Assert.Empty(view.Timed.Items); Assert.Empty(view.Untimed.Items);
        Assert.Equal(0, view.Glance.OpenItemCount); Assert.Equal(0m, view.Glance.PlannedRemainingSeconds);
        Assert.Equal(view.Day.PlanningVersion, view.Versions.Planning);
        Assert.Equal(view.Versions.Planning, view.Glance.PlanningVersion);
        Assert.Equal(view.Versions.Planning, view.Support.PlanningVersion);
        var tasks = await TaskScenario.Read<Adhd.Application.Tasks.TaskPage>(await a.Client.GetAsync("/api/tasks"));
        var work = await TaskScenario.Read<Adhd.Application.Work.WorkPage>(await a.Client.GetAsync("/api/work-sessions"));
        var occurrences = await TaskScenario.Read<SpecialDayOccurrencePage>(await a.Client.GetAsync("/api/special-days/occurrences?fromDate=2026-10-25&toDate=2026-10-25"));
        Assert.Equal(view.Versions, tasks.Coverage!.Versions);
        Assert.Equal(view.Versions, work.Coverage!.Versions);
        Assert.Equal(view.Versions, occurrences.Coverage!.Versions);
        await using var db = fixture.CreateContext();
        Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == a.UserId));
        foreach (var query in new[] { "?itemLimit=0", "?scheduleLimit=101", "?itemOffset=-1", "?scheduleOffset=100001" })
            Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.GetAsync("/api/daily-plans/2026-10-25/overview" + query)).StatusCode);
    }

    [Fact]
    public async Task BoundedPagesKeepWholeDayTotalsAndUnknownEstimatesInsteadOfSummingTheFirstPage()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        for (var i = 0; i < 101; i++)
        {
            var task = await user.Root($"Item {i:000}");
            await user.Define(task.Id, true, i == 0 ? null : 60, i == 1 ? 7200 : null);
            await Add(user, task.Id);
        }
        var first = await Read(user, query: "?itemLimit=25&scheduleLimit=1");
        var second = await Read(user, query: "?itemLimit=25&itemOffset=25&scheduleLimit=1");
        Assert.Equal(101, first.Untimed.Total); Assert.Equal(25, first.Untimed.Items.Length);
        Assert.Equal(25, second.Untimed.Items.Length); Assert.Equal(25, second.Untimed.Offset);
        Assert.Empty(first.Untimed.Items.Select(x => x.Id).Intersect(second.Untimed.Items.Select(x => x.Id)));
        Assert.Equal(101, first.Glance.OpenItemCount); Assert.Equal(1, first.Glance.UnknownEstimateCount);
        Assert.Equal(6000m, first.Glance.PlannedRemainingSeconds);
        Assert.Equal(first.Glance.PlannedRemainingSeconds, second.Glance.PlannedRemainingSeconds);
    }

    [Theory]
    [InlineData("2026-03-29", 23)]
    [InlineData("2026-10-25", 25)]
    public async Task FrozenZoneSurvivesPreferenceChangesAndDayWindowsKeepDstLength(string date, int hours)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await user.Client.GetAsync("/api/preferences"));
        var write = await user.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { TimeZoneId = "Europe/Berlin" } });
        Assert.Equal(HttpStatusCode.OK, write.StatusCode); prefs = await TaskScenario.Read<PreferencesSnapshot>(write);
        var task = await user.Root(); await user.Define(task.Id, true, 60); await Add(user, task.Id, date);
        Assert.Equal(HttpStatusCode.OK, (await user.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { TimeZoneId = "Europe/Istanbul" } })).StatusCode);
        var view = await Read(user, date);
        Assert.Equal("Europe/Berlin", view.Day.TimeZoneId);
        Assert.Equal(hours, (view.WindowEndsAt - view.WindowStartsAt).TotalHours);
        Assert.Equal(task.Id, Assert.Single(view.Untimed.Items).TaskId);
    }

    [Fact]
    public async Task NextStepCreatesEditsAndDeletesAdvanceOnlyTheOwnerNotesStampAndRefreshTheHint()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var task = await user.Root(); await user.Define(task.Id, true, 60); await Add(user, task.Id);
        var before = await Workspace(user);
        var create = await user.Client.PostAsJsonAsync("/api/notes", new { kind = "NextStep", text = "First step", taskId = task.Id });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); var note = await TaskScenario.Read<NoteView>(create);
        var added = await Read(user);
        Assert.Equal(before.Versions.Notes + 1, added.Versions.Notes);
        Assert.Equal(before.PlanningVersion, added.Versions.Planning);
        Assert.Equal("First step", Assert.Single(added.Glance.Hints).NextStep!.Text);
        var edit = await user.Client.PutAsJsonAsync($"/api/notes/{note.Id}", new { version = note.Version, text = "Changed step" });
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode); note = await TaskScenario.Read<NoteView>(edit);
        var changed = await Read(user);
        Assert.Equal(added.Versions.Notes + 1, changed.Versions.Notes);
        Assert.Equal("Changed step", Assert.Single(changed.Glance.Hints).NextStep!.Text);
        var remove = await user.Client.PostAsJsonAsync($"/api/notes/{note.Id}/delete", new { version = note.Version });
        Assert.Equal(HttpStatusCode.OK, remove.StatusCode);
        var deleted = await Read(user);
        Assert.Equal(changed.Versions.Notes + 1, deleted.Versions.Notes);
        Assert.Null(Assert.Single(deleted.Glance.Hints).NextStep);
        Assert.Equal(0, (await Workspace(other)).Versions.Notes);
        await using var db = fixture.CreateContext();
        var events = await db.Outbox.Where(x => x.UserId == user.UserId && x.Kind == "NotesChanged").OrderBy(x => x.SourceVersion).ToArrayAsync();
        Assert.Equal(new long[] { 1, 2, 3 }, events.Select(x => x.SourceVersion));
        Assert.All(events, x => Assert.DoesNotContain("step", x.Payload, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SpecialDayReplayAndRejectedWritesDoNotAdvanceTheStampButDeleteDoes()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var before = await Workspace(user);
        var body = new { title = "Rest day", kind = "Holiday", month = 10, day = 25, year = 2026,
            recurrence = "Once", nonWorking = true, reminder = "None" };
        var key = Guid.NewGuid().ToString();
        var create = await ManualPlanningTests.Send(user, HttpMethod.Post, "/api/special-days", body, key);
        Assert.Equal(HttpStatusCode.Created, create.StatusCode); var special = await TaskScenario.Read<SpecialDayView>(create);
        Assert.Equal(HttpStatusCode.Created, (await ManualPlanningTests.Send(user, HttpMethod.Post, "/api/special-days", body, key)).StatusCode);
        var added = await Workspace(user);
        Assert.Equal(before.Versions.SpecialDays + 1, added.Versions.SpecialDays);
        Assert.Equal(before.PlanningVersion, added.PlanningVersion);
        var rejected = await user.Client.PostAsJsonAsync($"/api/special-days/{special.Id}/delete", new { version = special.Version + 1 });
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Equal(added.Versions.SpecialDays, (await Workspace(user)).Versions.SpecialDays);
        Assert.Equal(HttpStatusCode.OK, (await user.Client.PostAsJsonAsync($"/api/special-days/{special.Id}/delete", new { version = special.Version })).StatusCode);
        Assert.Equal(added.Versions.SpecialDays + 1, (await Workspace(user)).Versions.SpecialDays);
        Assert.Equal(0, (await Workspace(other)).Versions.SpecialDays);
    }

    [Fact]
    public async Task TimedWorkBreakAndBufferRetainTheirIdsVersionsAndFrozenTaskSnapshots()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app); var task = await user.Root("Frozen title"); await user.Define(task.Id, true, 3600);
        await ManualPlanningTests.Create(user, task.Id, Morning.AddHours(1), Morning.AddHours(2));
        await ManualPlanningTests.Create(user, null, Morning.AddHours(2), Morning.AddMinutes(130), "Break");
        await ManualPlanningTests.Create(user, null, Morning.AddMinutes(130), Morning.AddMinutes(135), "Buffer");
        task = await user.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await user.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Current title" })).StatusCode);
        var view = await Read(user);
        Assert.Equal(3, view.Timed.Total);
        Assert.Equal(new[] { "Work", "Break", "Buffer" }, view.Timed.Items.Select(x => x.Kind.ToString()));
        Assert.All(view.Timed.Items, x => { Assert.True(x.Version > 0); Assert.Equal(view.Day.Id, x.DailyPlanId); });
        Assert.Equal("Frozen title", view.Timed.Items[0].TaskSnapshot!.Task.Title);
        Assert.Equal(3600m, view.Glance.PlannedRemainingSeconds);
    }
}
