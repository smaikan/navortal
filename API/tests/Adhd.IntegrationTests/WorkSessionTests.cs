using Adhd.Application.Auth;
using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Preferences;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class WorkSessionTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static Task<HttpResponseMessage> Start(TaskScenario s, Guid taskId, string? key = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/work-sessions/start") { Content = JsonContent.Create(new { taskId }) };
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return s.Client.SendAsync(request);
    }
    internal static async Task<WorkView> Started(TaskScenario s, Guid taskId)
    {
        var response = await Start(s, taskId); Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await TaskScenario.Read<WorkView>(response);
    }
    internal static async Task<WorkView> Change(TaskScenario s, WorkView session, string action)
    {
        var response = await s.Client.PostAsJsonAsync($"/api/work-sessions/{session.Id}/{action}", new { version = session.Version });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return await TaskScenario.Read<WorkView>(response);
    }
    [Fact]
    public async Task PauseResumeHasSixtyActiveMinutesAndFinishDoesNotCompleteTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var task = await s.Root(); await s.Define(task.Id, true, 3600); var work = await Started(s, task.Id);
        app.Clock.Now = Morning.AddMinutes(20); work = await Change(s, work, "pause"); Assert.Equal(1200m, work.ActiveSeconds);
        app.Clock.Now = Morning.AddMinutes(50); Assert.Null((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
        work = await Change(s, work, "resume"); app.Clock.Now = Morning.AddMinutes(90);
        var reloaded = await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current")); Assert.Equal(3600m, reloaded.ActiveSession!.ActiveSeconds);
        work = await Change(s, work, "finish"); Assert.Equal(3600m, work.ActiveSeconds); Assert.Equal(WorkState.Finished, work.State);
        Assert.Equal(TaskState.Paused, (await s.Get(task.Id)).State); Assert.False((await s.Get(task.Id)).DirectWorkCompleted);
        var segments = await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments?limit=1")); Assert.Equal(2, segments.Total); Assert.Single(segments.Items);
        var time = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/time")); Assert.Equal(3600m, time.DirectActualSeconds); Assert.Equal(0m, time.RemainingSeconds);
    }
    [Fact]
    public async Task ParallelStartsAndResumesLeaveOneOpenSegmentAndOldTabCannotCloseNewWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root();
        var results = await Task.WhenAll(Start(s, a.Id), Start(s, b.Id)); Assert.Single(results, x => x.StatusCode == HttpStatusCode.Created); Assert.Single(results, x => x.StatusCode == HttpStatusCode.Conflict);
        var first = await TaskScenario.Read<WorkView>(results.Single(x => x.StatusCode == HttpStatusCode.Created)); var pausedFirst = await Change(s, first, "pause");
        var second = await Started(s, first.TaskId == a.Id ? b.Id : a.Id); second = await Change(s, second, "pause");
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{first.Id}/finish", new { version = first.Version })).StatusCode);
        var resumes = await Task.WhenAll(s.Client.PostAsJsonAsync($"/api/work-sessions/{first.Id}/resume", new { version = pausedFirst.Version }), s.Client.PostAsJsonAsync($"/api/work-sessions/{second.Id}/resume", new { version = second.Version }));
        Assert.Single(resumes, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(resumes, x => x.StatusCode == HttpStatusCode.Conflict);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.WorkSegments.CountAsync(x => x.UserId == s.UserId && x.EndedAt == null));
    }
    [Fact]
    public async Task StartIsIdempotentAfterFinishAndRejectsKeyReuseForDifferentTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var t = await s.Root(); var other = await s.Root(); var key = Guid.NewGuid().ToString();
        var responses = await Task.WhenAll(Start(s, t.Id, key), Start(s, t.Id, key)); Assert.All(responses, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
        var first = await TaskScenario.Read<WorkView>(responses[0]); Assert.Equal(first.Id, (await TaskScenario.Read<WorkView>(responses[1])).Id);
        await Change(s, first, "finish"); var replay = await Start(s, t.Id, key); Assert.Equal("true", Assert.Single(replay.Headers.GetValues("Idempotent-Replay"))); Assert.Equal(first.Id, (await TaskScenario.Read<WorkView>(replay)).Id);
        Assert.Null((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
        Assert.Equal(HttpStatusCode.Conflict, (await Start(s, other.Id, key)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/work-sessions/start", new { taskId = t.Id })).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.WorkSessions.CountAsync(x => x.UserId == s.UserId));
    }
    [Theory]
    [InlineData(TaskAction.Complete)] [InlineData(TaskAction.CompleteDirectWork)] [InlineData(TaskAction.Defer)] [InlineData(TaskAction.Skip)] [InlineData(TaskAction.Cancel)]
    public async Task TaskLifecycleClosesActualAtSameInstantAndKeepsElapsed(TaskAction action)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var work = await Started(s, task.Id);
        app.Clock.Now = Morning.AddMinutes(7); var changed = await s.State(task.Id, action);
        var session = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(WorkState.Finished, session.State); Assert.Equal(app.Clock.Now, session.EndedAt); Assert.Equal(420m, session.ActiveSeconds);
        if (action is TaskAction.Complete or TaskAction.CompleteDirectWork) Assert.Equal(changed.CompletedAt, session.EndedAt);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/pause", new { version = work.Version })).StatusCode);
    }
    [Fact]
    public async Task CompleteSubtreeClosesPausedAndActiveSessionsButParentOnlyLeavesOptionalChildWorking()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var root = await s.Root(); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        var x = await Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(2); x = await Change(s, x, "pause"); var y = await Started(s, b.Id);
        await s.State(root.Id, TaskAction.Complete, ParentCompletionChoice.ParentOnly); Assert.NotNull((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
        app.Clock.Now = Morning.AddMinutes(5); await s.State(root.Id, TaskAction.Complete, ParentCompletionChoice.CompleteSubtree);
        Assert.Equal(WorkState.Finished, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{x.Id}"))).State);
        Assert.Equal(180m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{y.Id}"))).ActiveSeconds);
        Assert.Null((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
    }
    [Fact]
    public async Task ActualStartRechecksDependencyAndOvertimeDoesNotCompletePredecessor()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var parent = await s.Root(); var b = await s.Child(parent.Id);
        parent = await s.Get(parent.Id); Assert.Equal(HttpStatusCode.Created, (await s.Client.PostAsJsonAsync($"/api/tasks/{parent.Id}/dependencies", new { version = parent.Version, predecessorTaskId = a.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Start(s, b.Id)).StatusCode);
        await s.Define(a.Id, true, 60); var work = await Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(5); await Change(s, work, "finish");
        Assert.Equal(HttpStatusCode.Conflict, (await Start(s, b.Id)).StatusCode);
        await s.State(a.Id, TaskAction.Cancel); Assert.Equal(HttpStatusCode.Conflict, (await Start(s, b.Id)).StatusCode);
        await s.State(a.Id, TaskAction.Reopen); await s.State(a.Id, TaskAction.Complete); var started = await Started(s, b.Id); await Change(s, started, "pause");
        await s.State(a.Id, TaskAction.Reopen); Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{started.Id}/resume", new { version = started.Version + 1 })).StatusCode);
    }
    [Fact]
    public async Task LogoutClientCloseAndHostRestartContinueSameServerRecord()
    {
        // Çıkış oturumu kapatır. Yeniden girince aynı çalışma hâlâ sürer
        Guid sessionId; string token; TaskScenario s; string email;
        await using (var app = new PlannerFactory(fixture.ConnectionString))
        {
            app.Clock.Now = Morning; email = $"{Guid.NewGuid():N}@example.test"; var c0 = app.CreateClient();
            var auth = await TaskScenario.Read<AuthResponse>(await c0.PostAsJsonAsync("/api/auth/register", new { email, password = "123456" }));
            c0.DefaultRequestHeaders.Authorization = new("Bearer", auth.AccessToken); s = new(c0, auth.User.Id);
            var task = await s.Root(); var work = await Started(s, task.Id); sessionId = work.Id;
            Assert.Equal(HttpStatusCode.NoContent, (await s.Client.PostAsync("/api/auth/logout", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await s.Client.GetAsync("/api/work-sessions/current")).StatusCode); s.Client.Dispose();
        }
        await using var restarted = new PlannerFactory(fixture.ConnectionString); restarted.Clock.Now = Morning.AddHours(8); using var c = restarted.CreateClient();
        token = (await TaskScenario.Read<AuthResponse>(await c.PostAsJsonAsync("/api/auth/login", new { email, password = "123456" }))).AccessToken; c.DefaultRequestHeaders.Authorization = new("Bearer", token);
        var current = await TaskScenario.Read<CurrentWork>(await c.GetAsync("/api/work-sessions/current")); Assert.Equal(sessionId, current.ActiveSession!.Id); Assert.Equal(8 * 3600m, current.ActiveSession.ActiveSeconds);
    }
    [Fact]
    public async Task ImmutableNamesPathAndZoneSurviveRenameReparentClassificationAndPreferenceChange()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var parent = await s.Root("Old parent"); var task = await s.Child(parent.Id, "Old task");
        var projectResponse = await s.Client.PostAsJsonAsync("/api/projects", new { name = "Old project" }); var project = await projectResponse.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(); var projectId = project.GetProperty("id").GetGuid();
        task = await s.Get(task.Id); Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = task.Version, projectId, tagIds = Array.Empty<Guid>() })).StatusCode);
        var work = await Started(s, task.Id); var snapshot = work.TaskAtStart!; Assert.Equal("Old parent", Assert.Single(snapshot.Ancestors).Name); Assert.Equal("Old project", snapshot.Project!.Name);
        await s.Client.PutAsJsonAsync($"/api/projects/{projectId}", new { version = 1, name = "New project" }); task = await s.Get(task.Id);
        await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "New task" }); task = await s.Get(task.Id);
        await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/move", new { version = task.Version }); task = await s.Get(task.Id);
        await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = task.Version, tagIds = Array.Empty<Guid>() });
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { TimeZoneId = "UTC" } });
        var loaded = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal("Europe/Istanbul", loaded.TimeZoneId); Assert.Equal("Old task", loaded.TaskAtStart!.Title); Assert.Equal("Old project", loaded.TaskAtStart.Project!.Name); Assert.Equal(parent.Id, Assert.Single(loaded.TaskAtStart.Ancestors).Id);
    }
    [Fact]
    public async Task ActualRollupRemainingUnknownOvertimeAndArchiveAreIndependentOfBudget()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var root = await s.Root(); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        await s.Define(root.Id, false, budget: 99999); await s.Define(a.Id, true, 60); var first = await Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(2); await Change(s, first, "finish");
        var second = await Started(s, b.Id); app.Clock.Now = Morning.AddMinutes(3); await Change(s, second, "finish");
        var time = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{root.Id}/time")); Assert.Equal(180m, time.SubtreeActualSeconds); Assert.Equal(0m, time.DirectActualSeconds); Assert.Null(time.RemainingSeconds); Assert.Equal(1, time.UnknownRemainingCount); Assert.Equal(60m, time.KnownOvertimeSeconds);
        a = await s.Get(a.Id); Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{a.Id}/archive", new { version = a.Version })).StatusCode);
        time = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{root.Id}/time")); Assert.Equal(180m, time.SubtreeActualSeconds);
    }
    [Fact]
    public async Task HistoryCannotBeHiddenByContainerConversionAndUnfinishedWorkBlocksArchive()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var task = await s.Root(); var work = await Started(s, task.Id); task = await s.Get(task.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = task.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Reopen" })).StatusCode);
        await Change(s, work, "finish"); task = await s.Get(task.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/work-definition", new { version = task.Version, hasDirectWork = false, targetBudgetSeconds = 500 })).StatusCode);
        foreach (var disposition in new string?[] { null, "ConvertToContainer" }) Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/children", new { title = "Child", parentVersion = task.Version, parentWorkDisposition = disposition })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/children", new { title = "Child", parentVersion = task.Version, parentWorkDisposition = "PreserveDirect" })).StatusCode);
        Assert.True((await s.Get(task.Id)).HasDirectWork);
    }
    [Fact]
    public async Task ForeignSessionTaskAndInvalidPageAreRejectedAndPausedTaskUsesResume()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var task = await a.Root(); var work = await Started(a, task.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Start(b, task.Id)).StatusCode);
        foreach (var path in new[] { $"/api/work-sessions/{work.Id}", $"/api/work-sessions/{work.Id}/segments", $"/api/tasks/{task.Id}/time" }) Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/finish", new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.GetAsync("/api/work-sessions?limit=101")).StatusCode);
        work = await Change(a, work, "pause"); Assert.Equal(HttpStatusCode.Conflict, (await Start(a, task.Id)).StatusCode);
        Assert.Single((await TaskScenario.Read<WorkPage>(await a.Client.GetAsync("/api/work-sessions?state=Paused"))).Items);
    }
}
