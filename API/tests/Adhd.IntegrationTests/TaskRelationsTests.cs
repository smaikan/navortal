using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class TaskRelationsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static async Task<HttpResponseMessage> Add(TaskScenario s, Guid source, Guid target, bool soft = false)
    {
        var task = await s.Get(target);
        return soft
            ? await s.Client.PostAsJsonAsync($"/api/tasks/{target}/ordering", new { version = task.Version, beforeTaskId = source })
            : await s.Client.PostAsJsonAsync($"/api/tasks/{target}/dependencies", new { version = task.Version, predecessorTaskId = source });
    }
    private static async Task<TaskStartDecision> Start(TaskScenario s, Guid id) => await TaskScenario.Read<TaskStartDecision>(await s.Client.GetAsync($"/api/tasks/{id}/start-eligibility"));
    [Fact]
    public async Task HardPreconditionsNeedRealCompletionSoftOrderDoesNotBlockAndDeletionIsAudited()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var a = await s.Root("A"); var b = await s.Root("B"); var c = await s.Root("C");
        Assert.Equal(HttpStatusCode.Created, (await Add(s, a.Id, b.Id, true)).StatusCode); Assert.True((await Start(s, b.Id)).CanStart);
        Assert.Equal(HttpStatusCode.Created, (await Add(s, a.Id, b.Id)).StatusCode); Assert.False((await Start(s, b.Id)).CanStart);
        await s.State(a.Id, TaskAction.Cancel); Assert.Contains(a.Id, (await Start(s, b.Id)).BlockingPredecessorIds);
        await s.State(a.Id, TaskAction.Complete); Assert.True((await Start(s, b.Id)).CanStart);
        Assert.Equal(HttpStatusCode.Created, (await Add(s, c.Id, b.Id)).StatusCode); Assert.Equal(c.Id, Assert.Single((await Start(s, b.Id)).BlockingPredecessorIds));
        await s.State(c.Id, TaskAction.Complete); Assert.True((await Start(s, b.Id)).CanStart);
        var listResponse = await s.Client.GetAsync($"/api/tasks/{b.Id}/dependencies");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);
        var list = await TaskScenario.Read<TaskRelationPage>(listResponse);
        Assert.Equal(2, list.Total); Assert.All(list.Items, x => Assert.Equal("FinishToStart", x.Kind));
        b = await s.Get(b.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await s.Client.DeleteAsync($"/api/tasks/{b.Id}/dependencies/{a.Id}?version={b.Version}")).StatusCode);
        Assert.Single((await TaskScenario.Read<TaskRelationPage>(await s.Client.GetAsync($"/api/tasks/{b.Id}/dependencies"))).Items);
        Assert.Single((await TaskScenario.Read<TaskRelationPage>(await s.Client.GetAsync($"/api/tasks/{b.Id}/ordering"))).Items);
        await using var db = fixture.CreateContext();
        var removed = await db.TaskEvents.SingleAsync(x => x.TaskId == b.Id && x.Type == "DependencyRemoved");
        using var payload = JsonDocument.Parse(removed.Payload); Assert.Equal(a.Id, payload.RootElement.GetProperty("data").GetProperty("SourceTaskId").GetGuid());
    }
    [Fact]
    public async Task SelfTwoAndThreeNodeCyclesRollbackAllRelationAndVersionChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var a = await s.Root("A"); var b = await s.Root("B"); var c = await s.Root("C");
        Assert.Equal(HttpStatusCode.Created, (await Add(s, a.Id, b.Id)).StatusCode); Assert.Equal(HttpStatusCode.Created, (await Add(s, b.Id, c.Id)).StatusCode);
        foreach (var source in new[] { a.Id, b.Id, c.Id }) Assert.Equal(HttpStatusCode.BadRequest, (await Add(s, source, a.Id)).StatusCode);
        Assert.Equal(a.Version, (await s.Get(a.Id)).Version);
        await using var db = fixture.CreateContext(); Assert.Equal(2, await db.TaskDependencies.CountAsync(x => x.UserId == s.UserId));
        Assert.Equal(5, (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion);
    }
    [Fact]
    public async Task ParentDependenciesAreInheritedAndCrossBranchSelfWaitingIsRejected()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var predecessor = await s.Root("Before"); var parent = await s.Root("Parent"); var child = await s.Child(parent.Id);
        Assert.Equal(HttpStatusCode.Created, (await Add(s, predecessor.Id, parent.Id)).StatusCode);
        Assert.Contains(predecessor.Id, (await Start(s, child.Id)).BlockingPredecessorIds);
        await s.State(predecessor.Id, TaskAction.Complete); Assert.True((await Start(s, child.Id)).CanStart);
        var other = await s.Root("Other"); var otherChild = await s.Child(other.Id);
        Assert.Equal(HttpStatusCode.Created, (await Add(s, child.Id, other.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Add(s, otherChild.Id, parent.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Add(s, parent.Id, child.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Add(s, child.Id, parent.Id)).StatusCode);
    }
    [Fact]
    public async Task ReparentAndRequiredFlagChangesCannotIntroduceDependencyCycles()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var a = await s.Root("A"); var b = await s.Root("B"); Assert.Equal(HttpStatusCode.Created, (await Add(s, a.Id, b.Id)).StatusCode);
        a = await s.Get(a.Id); b = await s.Get(b.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync($"/api/tasks/{a.Id}/move", new { version = a.Version, parentTaskId = b.Id, parentVersion = b.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync($"/api/tasks/{b.Id}/move", new { version = b.Version, parentTaskId = a.Id, parentVersion = a.Version })).StatusCode);
        Assert.Null((await s.Get(a.Id)).ParentTaskId); Assert.Null((await s.Get(b.Id)).ParentTaskId); Assert.True((await s.Get(a.Id)).HasDirectWork);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{b.Id}/required", new { version = b.Version, requiredForParent = false })).StatusCode);
        b = await s.Get(b.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{b.Id}/move", new { version = b.Version, parentTaskId = a.Id, parentVersion = a.Version })).StatusCode);
        b = await s.Get(b.Id); var parent = await s.Get(a.Id);
        Assert.Equal(TaskState.Completed, parent.State);
        var denied = await s.Client.PutAsJsonAsync($"/api/tasks/{b.Id}/required", new { version = b.Version, requiredForParent = true });
        Assert.Equal(HttpStatusCode.BadRequest, denied.StatusCode); Assert.Contains("dependency_cycle", await denied.Content.ReadAsStringAsync());
        Assert.False((await s.Get(b.Id)).RequiredForParent); Assert.Equal(b.Version, (await s.Get(b.Id)).Version);
        Assert.Equal(parent.Version, (await s.Get(a.Id)).Version);
    }
    [Fact]
    public async Task OwnershipAndDatabaseCompositeKeysPreventCrossUserAndDuplicateRelations()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var source = await a.Root(); var target = await a.Root(); var foreign = await b.Root();
        Assert.Equal(HttpStatusCode.NotFound, (await Add(a, foreign.Id, target.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.PostAsJsonAsync($"/api/tasks/{foreign.Id}/dependencies", new { version = foreign.Version, predecessorTaskId = source.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Add(a, foreign.Id, target.Id, true)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/tasks/{target.Id}/dependencies")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/tasks/{target.Id}/start-eligibility")).StatusCode);
        await using var db = fixture.CreateContext();
        db.TaskDependencies.Add(new TaskDependency { Id = Guid.CreateVersion7(), UserId = a.UserId, PredecessorTaskId = foreign.Id, SuccessorTaskId = target.Id });
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState); db.ChangeTracker.Clear();
        Assert.Equal(HttpStatusCode.Created, (await Add(a, source.Id, target.Id)).StatusCode);
        db.TaskDependencies.Add(new TaskDependency { Id = Guid.CreateVersion7(), UserId = a.UserId, PredecessorTaskId = source.Id, SuccessorTaskId = target.Id });
        error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.UniqueViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
    }
    [Fact]
    public async Task ConcurrentDuplicateAddsHaveOneEffectAndFreshDuplicateIsExplicitConflict()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var a = await s.Root(); var b = await s.Root();
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => s.Client.PostAsJsonAsync($"/api/tasks/{b.Id}/dependencies", new { version = b.Version, predecessorTaskId = a.Id })));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Created); Assert.Equal(3, results.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        var duplicate = await Add(s, a.Id, b.Id); Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode); Assert.Contains("relation_exists", await duplicate.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync($"/api/tasks/{b.Id}/dependencies?limit=101")).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Single(await db.TaskDependencies.Where(x => x.UserId == s.UserId).ToArrayAsync());
        Assert.Equal(2, await db.TaskEvents.CountAsync(x => x.TaskId == b.Id));
    }
    [Fact]
    public async Task SoftOrderingEvenWhenConflictingNeverActsAsExecutionPrecondition()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var a = await s.Root(); var b = await s.Root(); var c = await s.Root();
        foreach (var (source, target) in new[] { (a.Id, b.Id), (b.Id, c.Id), (c.Id, a.Id) }) Assert.Equal(HttpStatusCode.Created, (await Add(s, source, target, true)).StatusCode);
        foreach (var task in new[] { a, b, c }) Assert.True((await Start(s, task.Id)).CanStart);
        await using var db = fixture.CreateContext(); Assert.Equal(3, await db.TaskOrderingPreferences.CountAsync(x => x.UserId == s.UserId)); Assert.False(await db.TaskDependencies.AnyAsync(x => x.UserId == s.UserId));
    }
}
