using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Collections;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class TaskClassificationTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task CompletedVisibilityAndStateFiltersKeepPaginationTotalsAccurate()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var open = await s.Root("Open"); var done = await s.Root("Done"); await s.State(done.Id, TaskAction.Complete);
        Assert.Equal(2, (await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks"))).Total);
        var hidden = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?includeCompleted=false")); Assert.Equal(1, hidden.Total); Assert.Equal(open.Id, Assert.Single(hidden.Items).Id);
        var completed = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?state=Completed")); Assert.Equal(1, completed.Total); Assert.Equal(done.Id, Assert.Single(completed.Items).Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/tasks?state=99")).StatusCode);
    }
    [Fact]
    public async Task TurkishSearchUsesDefinedCollationRegardlessOfDatabaseDefaultLocale()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var task = await s.Root("Üst İş IŞIK");
        var response = await s.Client.GetAsync($"/api/tasks?search={Uri.EscapeDataString("üst iş ışık")}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await TaskScenario.Read<TaskPage>(response); Assert.Equal(task.Id, Assert.Single(page.Items).Id);
    }
    private static async Task<NamedResourceView> Resource(TaskScenario s, string route, string name = "Group") =>
        await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync($"/api/{route}", new { name }));
    private static async Task<ClassificationView> Get(TaskScenario s, Guid taskId) => await TaskScenario.Read<ClassificationView>(await s.Client.GetAsync($"/api/tasks/{taskId}/classification"));
    private static async Task<ClassificationView> Assign(TaskScenario s, Guid taskId, Guid? project = null, Guid? pool = null, Guid? category = null, Guid[]? tags = null, bool subtree = false)
    {
        var current = await Get(s, taskId);
        var response = await s.Client.PutAsJsonAsync($"/api/tasks/{taskId}/classification", new
        { version = current.Version, projectId = project, poolId = pool, categoryId = category, tagIds = tags ?? [], applyToSubtree = subtree, expectedPlanningVersion = current.PlanningVersion });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return await TaskScenario.Read<ClassificationView>(response);
    }
    private static async Task<NamedResourceWorkload> Summary(TaskScenario s, string route, Guid id) => await TaskScenario.Read<NamedResourceWorkload>(await s.Client.GetAsync($"/api/{route}/{id}/workload"));
    [Fact]
    public async Task ClassificationChildInheritanceFiltersAndCommonTotalsNeverDuplicateTasks()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var p = await Resource(s, "projects"); var pool = await Resource(s, "pools"); var category = await Resource(s, "categories"); var t1 = await Resource(s, "tags", "One"); var t2 = await Resource(s, "tags", "Two");
        var root = await s.Root("Z root"); await s.Define(root.Id, true, 600); await Assign(s, root.Id, p.Id, pool.Id, category.Id, [t1.Id, t2.Id]);
        var child = await s.Child(root.Id, "A child"); await s.Define(child.Id, true, 1200);
        var inherited = await Get(s, child.Id); Assert.Equal(p.Id, inherited.Values.ProjectId); Assert.Equal(2, inherited.Values.TagIds.Length);
        var summary = await Summary(s, "projects", p.Id); Assert.Equal(1800, summary.Values.CalculatedTotalSeconds); Assert.Equal(2, summary.Values.DirectComponentCount);
        Assert.Equal(1800, (await Summary(s, "pools", pool.Id)).Values.CalculatedTotalSeconds);
        var pageResponse = await s.Client.GetAsync($"/api/tasks?projectId={p.Id}&poolId={pool.Id}&categoryId={category.Id}&tagId={t1.Id}&orderBy=Title");
        Assert.Equal(HttpStatusCode.OK, pageResponse.StatusCode); var page = await TaskScenario.Read<TaskPage>(pageResponse);
        Assert.Equal([child.Id, root.Id], page.Items.Select(x => x.Id));
        await Assign(s, child.Id, p.Id, pool.Id, category.Id, [t2.Id, t2.Id]);
        page = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync($"/api/tasks?tagId={t1.Id}")); Assert.Equal(root.Id, Assert.Single(page.Items).Id);
        root = await s.Get(root.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}", new { version = root.Version, title = root.Title, priority = "Urgent" })).StatusCode);
        page = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync($"/api/tasks?projectId={p.Id}&orderBy=Priority")); Assert.Equal(root.Id, page.Items[0].Id);
        _ = await s.Child(root.Id, "Unknown step"); summary = await Summary(s, "projects", p.Id);
        Assert.Equal(1800, summary.Values.KnownEstimatedSeconds); Assert.Equal(1, summary.Values.UnknownEstimateCount); Assert.Null(summary.Values.CalculatedTotalSeconds);
        await using var db = fixture.CreateContext(); Assert.Equal(3, await db.Tasks.CountAsync(x => x.UserId == s.UserId));
        Assert.Single(await db.TaskTagLinks.Where(x => x.TaskId == child.Id).ToArrayAsync());
    }
    [Fact]
    public async Task MovingKeepsClassificationAndResourceArchiveKeepsTaskReferences()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var p = await Resource(s, "projects", "A"); var q = await Resource(s, "projects", "B");
        var a = await s.Root("A root"); await Assign(s, a.Id, p.Id); var child = await s.Child(a.Id); child = await s.Define(child.Id, true, 1200);
        var b = await s.Root("B root"); await Assign(s, b.Id, q.Id); b = await s.Get(b.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{child.Id}/move", new { version = child.Version, parentTaskId = b.Id, parentVersion = b.Version })).StatusCode);
        Assert.Equal(p.Id, (await Get(s, child.Id)).Values.ProjectId);
        Assert.Equal(1200, (await Summary(s, "projects", p.Id)).Values.CalculatedTotalSeconds); Assert.Equal(0, (await Summary(s, "projects", q.Id)).Values.CalculatedTotalSeconds);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/projects/{p.Id}/archive", new { version = p.Version })).StatusCode);
        Assert.Equal(p.Id, (await s.Get(child.Id)).ProjectId); Assert.Equal(child.Id, (await s.Get(child.Id)).Id);
        Assert.Equal(q.Id, Assert.Single((await TaskScenario.Read<NamedResourcePage>(await s.Client.GetAsync("/api/projects"))).Items).Id);
        Assert.Equal(1200, (await Summary(s, "projects", p.Id)).Values.CalculatedTotalSeconds);
    }
    [Fact]
    public async Task SubtreeAssignmentUsesPlanningVersionAndStaleCascadeCannotOverwriteChildChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var p = await Resource(s, "projects", "A"); var q = await Resource(s, "projects", "B"); var tag = await Resource(s, "tags");
        var root = await s.Root(); var child = await s.Child(root.Id); var grandchild = await s.Child(child.Id);
        var before = await Get(s, root.Id); var applied = await Assign(s, root.Id, p.Id, tags: [tag.Id], subtree: true);
        Assert.Equal(before.PlanningVersion + 1, applied.PlanningVersion);
        foreach (var task in new[] { root, child, grandchild }) { var value = await Get(s, task.Id); Assert.Equal(p.Id, value.Values.ProjectId); Assert.Equal(tag.Id, Assert.Single(value.Values.TagIds)); }
        var stale = await Get(s, root.Id); child = await s.Get(child.Id);
        await s.Client.PutAsJsonAsync($"/api/tasks/{child.Id}", new { version = child.Version, title = "New child edit" });
        var rejected = await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}/classification", new { version = stale.Version, projectId = q.Id, tagIds = Array.Empty<Guid>(), applyToSubtree = true, expectedPlanningVersion = stale.PlanningVersion });
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode); Assert.Contains("planning_version_conflict", await rejected.Content.ReadAsStringAsync());
        Assert.Equal(p.Id, (await Get(s, child.Id)).Values.ProjectId); Assert.Equal("New child edit", (await s.Get(child.Id)).Title);
        await Assign(s, root.Id, q.Id, subtree: true);
        Assert.Equal(0, (await Summary(s, "projects", p.Id)).Values.TaskCount); Assert.Equal(1, (await Summary(s, "projects", q.Id)).Values.TaskCount);
    }
    [Fact]
    public async Task ForeignOrWrongTypeResourcesCannotBeAttachedAndDatabaseEnforcesOwnership()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app);
        var owned = await Resource(a, "projects"); var tagA = await Resource(a, "tags"); var foreign = await Resource(b, "projects"); var tagB = await Resource(b, "tags"); var task = await a.Root();
        foreach (var project in new[] { foreign.Id, tagA.Id }) Assert.Equal(HttpStatusCode.NotFound, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = task.Version, projectId = project })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = task.Version, tagIds = new[] { tagB.Id } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/tasks/{task.Id}/classification")).StatusCode);
        await Assign(a, task.Id, owned.Id, tags: [tagA.Id]);
        await using var db = fixture.CreateContext(); var row = await db.Tasks.SingleAsync(x => x.Id == task.Id); row.ProjectId = foreign.Id;
        var error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
        db.ChangeTracker.Clear(); db.TaskTagLinks.Add(new TaskTagLink { UserId = a.UserId, TaskId = task.Id, TagId = tagB.Id });
        error = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(error.InnerException).SqlState);
        db.ChangeTracker.Clear(); Assert.Equal(owned.Id, (await db.Tasks.SingleAsync(x => x.Id == task.Id)).ProjectId);
        Assert.Equal(tagA.Id, Assert.Single(await db.TaskTagLinks.Where(x => x.TaskId == task.Id).Select(x => x.TagId).ToArrayAsync()));
    }
    [Fact]
    public async Task FailedCascadeEventRollsBackAllTaskTagAndPlanningChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var project = await Resource(s, "projects"); var tag = await Resource(s, "tags"); var root = await s.Root("Classification rollback sentinel"); var child = await s.Child(root.Id);
        var current = await Get(s, root.Id); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_classification_test() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW."Type" = 'ClassificationChanged' AND NEW."Payload"->'after'->>'Title' = 'Classification rollback sentinel' THEN RAISE EXCEPTION 'test classification failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_classification_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_classification_test();
            """);
        try
        {
            var response = await s.Client.PutAsJsonAsync($"/api/tasks/{root.Id}/classification", new { version = current.Version, projectId = project.Id, tagIds = new[] { tag.Id }, applyToSubtree = true, expectedPlanningVersion = current.PlanningVersion });
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            foreach (var id in new[] { root.Id, child.Id }) { var value = await Get(s, id); Assert.Null(value.Values.ProjectId); Assert.Empty(value.Values.TagIds); }
            Assert.Equal(current.PlanningVersion, (await Get(s, root.Id)).PlanningVersion); Assert.Equal(current.Version, (await Get(s, root.Id)).Version);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_classification_test ON task_events; DROP FUNCTION reject_classification_test();"); }
        await Assign(s, root.Id, project.Id, tags: [tag.Id], subtree: true); Assert.Equal(project.Id, (await Get(s, child.Id)).Values.ProjectId);
    }
}
