using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Preferences;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class TaskLifecycleTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task OwnWorkAndRequiredChildrenGateAutomaticCompletionAndReopenPreservesOwnProgress()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); await s.Define(root.Id, true, 600); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        await s.Define(a.Id, true, 600); await s.Define(b.Id, true, 1200);
        await s.State(a.Id, TaskAction.Complete); await s.State(b.Id, TaskAction.Complete);
        Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
        var complete = await s.State(root.Id, TaskAction.CompleteDirectWork);
        Assert.Equal(TaskState.Completed, complete.State); Assert.Equal(CompletionOrigin.Automatic, complete.CompletionOrigin); Assert.NotNull(complete.CompletedAt);
        await s.State(a.Id, TaskAction.Reopen); root = await s.Get(root.Id);
        Assert.Equal(TaskState.Pending, root.State); Assert.True(root.DirectWorkCompleted); Assert.Null(root.CompletedAt);
        var progress = await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"));
        Assert.Equal(3, progress.ComponentCount); Assert.Equal(2, progress.CompletedComponentCount); Assert.Equal(.75, progress.DurationProgress);
        Assert.True(progress.HasOpenChildren);
        var components = await TaskScenario.Read<WorkComponentPage>(await s.Client.GetAsync($"/api/tasks/{root.Id}/work-components"));
        Assert.Equal(a.Id, Assert.Single(components.Items).TaskId);
    }
    [Fact]
    public async Task ParentChoicesDoNotEraseChildrenAndManualCompletionSurvivesChildReopen()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var child = await s.Child(root.Id); root = await s.Get(root.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{root.Id}/state", new { version = root.Version, action = "Complete" })).StatusCode);
        var canceled = await s.State(root.Id, TaskAction.Complete, ParentCompletionChoice.Cancel);
        Assert.Equal(root.Version, canceled.Version); Assert.Equal(TaskState.Pending, canceled.State);
        await s.State(root.Id, TaskAction.Complete, ParentCompletionChoice.ParentOnly);
        Assert.Equal(TaskState.Pending, (await s.Get(child.Id)).State);
        Assert.True((await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"))).HasOpenChildren);
        await s.State(child.Id, TaskAction.Complete); await s.State(child.Id, TaskAction.Reopen);
        root = await s.Get(root.Id); Assert.Equal(TaskState.Completed, root.State); Assert.Equal(CompletionOrigin.Manual, root.CompletionOrigin);
        await s.State(root.Id, TaskAction.Complete, ParentCompletionChoice.CompleteSubtree);
        Assert.Equal(TaskState.Completed, (await s.Get(child.Id)).State);
        Assert.False((await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"))).HasOpenDescendants);
    }
    [Fact]
    public async Task SavedParentCompletionPolicyCanChooseSubtreeWithoutExtraDialog()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { ParentCompletionPolicy = "CompleteSubtree" } })).StatusCode);
        var root = await s.Root(); var child = await s.Child(root.Id); await s.State(root.Id, TaskAction.Complete);
        Assert.Equal(TaskState.Completed, (await s.Get(child.Id)).State);
    }
    [Theory]
    [InlineData("Skip", TaskState.Skipped)]
    [InlineData("Cancel", TaskState.Canceled)]
    [InlineData("Defer", TaskState.Deferred)]
    public async Task SkippedCanceledDeferredWorkNeverReleasesParentAsCompleted(string action, TaskState expected)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var child = await s.Child(root.Id); await s.Define(child.Id, true, 0);
        Assert.Equal(TaskState.Pending, (await s.Get(child.Id)).State);
        var result = await s.State(child.Id, Enum.Parse<TaskAction>(action));
        Assert.Equal(expected, result.State); Assert.Null(result.CompletedAt); Assert.False(result.DirectWorkCompleted);
        Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
        var progress = await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"));
        Assert.Equal(0, progress.CompletedTaskCount); Assert.Equal(1, progress.IncompleteRequiredChildCount);
        await s.State(child.Id, TaskAction.Reopen); Assert.Equal(TaskState.Pending, (await s.Get(child.Id)).State);
    }
    [Fact]
    public async Task RequiredFlagReconcilesAutomaticParentAndOptionalOpenWorkRemainsVisible()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var a = await s.Child(root.Id); var b = await s.Child(root.Id);
        await s.State(a.Id, TaskAction.Complete); b = await s.Get(b.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{b.Id}/required", new { version = b.Version, requiredForParent = false })).StatusCode);
        root = await s.Get(root.Id); Assert.Equal(TaskState.Completed, root.State); Assert.Equal(CompletionOrigin.Automatic, root.CompletionOrigin);
        var progress = await TaskScenario.Read<TaskProgress>(await s.Client.GetAsync($"/api/tasks/{root.Id}/progress"));
        Assert.True(progress.HasOpenChildren); Assert.Equal(0, progress.IncompleteRequiredChildCount); Assert.Null(progress.DurationProgress);
        b = await s.Get(b.Id); await s.Client.PutAsJsonAsync($"/api/tasks/{b.Id}/required", new { version = b.Version, requiredForParent = true });
        Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
    }
    [Fact]
    public async Task ConcurrentAndForeignStateCommandsCannotOverwriteOrCreateDuplicateHistory()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var task = await a.Root();
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/required", new { version = task.Version, requiredForParent = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/tasks/{task.Id}/progress")).StatusCode);
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => a.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" })));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK); Assert.Equal(3, results.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        await using var db = fixture.CreateContext();
        var sequences = await db.TaskEvents.Where(x => x.TaskId == task.Id).OrderBy(x => x.Sequence).Select(x => x.Sequence).ToArrayAsync();
        Assert.Equal([1L, 2L], sequences);
        Assert.Equal(2, (await db.PlanningStates.SingleAsync(x => x.UserId == a.UserId)).PlanningVersion);
    }
    [Fact]
    public async Task ChildAdditionAndMoveReconcileAutomaticParentsWithoutRewritingManualParents()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var one = await s.Child(root.Id); await s.State(one.Id, TaskAction.Complete);
        Assert.Equal(TaskState.Completed, (await s.Get(root.Id)).State);
        var two = await s.Child(root.Id); Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
        two = await s.State(two.Id, TaskAction.Complete); var target = await s.Root();
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{two.Id}/move", new { version = two.Version, parentTaskId = target.Id, parentVersion = target.Version })).StatusCode);
        Assert.Equal(TaskState.Completed, (await s.Get(target.Id)).State); Assert.Equal(CompletionOrigin.Automatic, (await s.Get(target.Id)).CompletionOrigin);
        await using var db = fixture.CreateContext();
        var history = await db.TaskEvents.Where(x => x.TaskId == root.Id).OrderBy(x => x.Sequence).ToArrayAsync();
        Assert.Equal(history.Length, history.Select(x => x.Sequence).Distinct().Count()); Assert.Equal((await s.Get(root.Id)).Version, history[^1].Sequence);
    }
    [Fact]
    public async Task RepeatedCompletionKeepsOriginalTimestampAndCompletedOwnWorkCannotBeConvertedSilently()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var task = await s.Root(); task = await s.State(task.Id, TaskAction.Complete); var completedAt = task.CompletedAt;
        app.Clock.Now = app.Clock.Now.AddHours(1); var again = await s.State(task.Id, TaskAction.Complete);
        Assert.Equal(completedAt, again.CompletedAt); Assert.Equal(task.Version, again.Version);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/children", new { title = "Child", parentVersion = task.Version, parentWorkDisposition = "ConvertToContainer" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/work-definition", new { version = task.Version, hasDirectWork = false })).StatusCode);
        _ = await s.Child(task.Id); Assert.Equal(TaskState.Completed, (await s.Get(task.Id)).State);
    }
    [Fact]
    public async Task FailedStateEventRollsBackChildParentMetadataAndPlanningVersion()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var root = await s.Root(); var child = await s.Child(root.Id, "Completion rollback sentinel");
        await using var db = fixture.CreateContext(); var version = (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion;
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_state_event_test() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW."Payload"->'after'->>'Title' = 'Completion rollback sentinel' AND NEW."Payload"->'after'->>'State' = 'Completed' THEN RAISE EXCEPTION 'test state failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_state_event_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_state_event_test();
            """);
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await s.Client.PostAsJsonAsync($"/api/tasks/{child.Id}/state", new { version = child.Version, action = "Complete" })).StatusCode);
            Assert.Equal(TaskState.Pending, (await s.Get(child.Id)).State); Assert.Equal(TaskState.Pending, (await s.Get(root.Id)).State);
            Assert.False((await s.Get(child.Id)).DirectWorkCompleted); Assert.Null((await s.Get(child.Id)).CompletedAt);
            Assert.Equal(version, (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_state_event_test ON task_events; DROP FUNCTION reject_state_event_test();"); }
        await s.State(child.Id, TaskAction.Complete); Assert.Equal(TaskState.Completed, (await s.Get(root.Id)).State);
    }
}
