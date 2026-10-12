using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Sync;
using Adhd.Application.Work;
using Adhd.Domain.Focus;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class WorkspaceSnapshotTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 25, 6, 0, 0, TimeSpan.Zero);
    private static async Task<WorkspaceSnapshotView> Read(TaskScenario user, bool focus = false)
    {
        var response = await user.Client.GetAsync($"/api/workspace/snapshot?includeFocus={focus.ToString().ToLowerInvariant()}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        return await TaskScenario.Read<WorkspaceSnapshotView>(response);
    }

    [Fact]
    public async Task AuthenticationIsRequiredAndAnEmptyReadCreatesNoPlanOrWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        using var anonymous = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/workspace/snapshot")).StatusCode);
        var user = await TaskScenario.User(app);
        var snapshot = await Read(user);
        Assert.Null(snapshot.ActiveWork); Assert.Null(snapshot.FocusSessionId);
        Assert.False(snapshot.FocusIncluded); Assert.Null(snapshot.ActiveFocus);
        Assert.Equal("Europe/Istanbul", snapshot.Preferences.TimeZoneId);
        Assert.False(snapshot.Preferences.HasWorkingWindows);
        using var wire = JsonDocument.Parse(await user.Client.GetStringAsync("/api/workspace/snapshot"));
        var prefs = wire.RootElement.GetProperty("preferences");
        Assert.False(prefs.TryGetProperty("weekly", out _)); Assert.False(prefs.TryGetProperty("exceptions", out _));
        await using var db = fixture.CreateContext();
        Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == user.UserId));
        Assert.False(await db.WorkSessions.AnyAsync(x => x.UserId == user.UserId));
    }

    [Fact]
    public async Task ActiveWorkAndDisplayPreferencesRemainOwnerScoped()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await a.Root("Private running task"); await a.Define(task.Id, true, null);
        using var start = new HttpRequestMessage(HttpMethod.Post, "/api/work-sessions/start")
        { Content = JsonContent.Create(new { taskId = task.Id }) };
        start.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Created, (await a.Client.SendAsync(start)).StatusCode);
        app.Clock.Now = Morning.AddMinutes(2);
        var own = await Read(a); var foreign = await Read(b);
        Assert.Equal(task.Id, own.ActiveWork!.TaskId); Assert.Equal(120m, own.ActiveWork.ActiveSeconds);
        Assert.Equal(own.ServerNow, own.ActiveWork.ServerNow);
        Assert.Null(foreign.ActiveWork); Assert.Null(foreign.FocusSessionId);
        Assert.DoesNotContain("Private running task", await b.Client.GetStringAsync("/api/workspace/snapshot"));
    }

    [Fact]
    public async Task PassiveSnapshotDoesNotAdvanceFocusButExplicitFocusReusesTheExistingTransitionOnce()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var user = await TaskScenario.User(app);
        var focus = await FocusTests.Start(user, settings: new(300, 120, 600, 2, FocusTargetBehavior.AutoBreak));
        app.Clock.Now = Morning.AddMinutes(8);
        var passive = await Read(user);
        Assert.Equal(focus.Id, passive.FocusSessionId); Assert.False(passive.FocusIncluded);
        Assert.Null(passive.ActiveFocus); Assert.Equal(WorkState.Running, passive.ActiveWork!.State);
        await using (var db = fixture.CreateContext())
            Assert.Equal(FocusState.Working, (await db.FocusSessions.SingleAsync(x => x.Id == focus.Id)).State);
        var active = await Read(user, true);
        Assert.True(active.FocusIncluded); Assert.Equal(FocusState.Break, active.ActiveFocus!.State);
        Assert.Equal(WorkState.Paused, active.ActiveWork!.State);
        Assert.Equal(active.ActiveWork.Id, active.ActiveFocus.WorkSessionId);
        Assert.Equal(active.ActiveWork.Version, active.ActiveFocus.WorkSessionVersion);
        Assert.Equal(active.ServerNow, active.ActiveFocus.ServerNow);
        var again = await Read(user, true);
        Assert.Equal(active.ActiveFocus.Version, again.ActiveFocus!.Version);
        Assert.Equal(active.ActiveWork.Version, again.ActiveWork!.Version);
        Assert.Equal(active.ActiveFocus.TargetEventId, again.ActiveFocus.TargetEventId);
    }

    [Fact]
    public async Task ExplicitFocusAbsenceIsDifferentFromAnOmittedFocusRead()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var user = await TaskScenario.User(app);
        var view = await Read(user, true);
        Assert.True(view.FocusIncluded); Assert.Null(view.ActiveFocus); Assert.Null(view.FocusSessionId);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.Client.GetAsync("/api/workspace/snapshot?includeFocus=invalid")).StatusCode);
    }
}
