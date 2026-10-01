using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Auth;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

public sealed class TaskTreeTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static async Task<T> Read<T>(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<T>(Json))!;
    private static async Task<(HttpClient Client, Guid Id)> User(PlannerFactory app)
    {
        var client = app.CreateClient(); var auth = await Read<AuthResponse>(await client.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" }));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken); return (client, auth.User.Id);
    }
    private static async Task<TaskView> Root(HttpClient c, string title) => await Read<TaskView>(await c.PostAsJsonAsync("/api/tasks", new { title }));
    private static async Task<TaskView> Get(HttpClient c, Guid id) => await Read<TaskView>(await c.GetAsync($"/api/tasks/{id}"));
    private static async Task<TaskView> Child(HttpClient c, Guid parentId, string title)
    {
        var parent = await Get(c, parentId); var response = await c.PostAsJsonAsync($"/api/tasks/{parentId}/children", new { title, parentVersion = parent.Version });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await Read<TaskView>(response);
    }
    [Fact]
    public async Task RootChildGrandchildReloadAndMovePreserveIdsAndDescendants()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var a = await Root(c, "A"); var child = await Child(c, a.Id, "Child"); var grandchild = await Child(c, child.Id, "Grandchild"); var b = await Root(c, "B");
        var tree = await Read<TreePage>(await c.GetAsync($"/api/tasks/{a.Id}/subtree"));
        Assert.Equal([a.Id, child.Id, grandchild.Id], tree.Items.Select(x => x.Id)); Assert.False(tree.HasMore);
        Assert.Equal(child.Id, tree.Items[2].ParentTaskId);
        Assert.False((await Get(c, a.Id)).HasDirectWork);
        child = await Get(c, child.Id); b = await Get(c, b.Id);
        var moved = await c.PostAsJsonAsync($"/api/tasks/{child.Id}/move", new { version = child.Version, parentTaskId = b.Id, parentVersion = b.Version });
        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        Assert.Equal(b.Id, (await Get(c, child.Id)).ParentTaskId); Assert.Equal(child.Id, (await Get(c, grandchild.Id)).ParentTaskId);
        Assert.Single((await Read<TreePage>(await c.GetAsync($"/api/tasks/{a.Id}/subtree"))).Items);
        Assert.Equal(3, (await Read<TreePage>(await c.GetAsync($"/api/tasks/{b.Id}/subtree"))).Items.Length);
        var roots = await Read<TreePage>(await c.GetAsync("/api/tasks/children")); Assert.Equal([a.Id, b.Id], roots.Items.Select(x => x.Id));
    }
    [Fact]
    public async Task SelfDescendantForeignAndInvalidSiblingMovesLeaveTreeAndVersionsUnchanged()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (a, userId) = await User(app); var (b, _) = await User(app);
        var root = await Root(a, "Root"); var child = await Child(a, root.Id, "Child"); var grandchild = await Child(a, child.Id, "Grandchild"); var foreign = await Root(b, "Foreign");
        root = await Get(a, root.Id); grandchild = await Get(a, grandchild.Id);
        await using var db = fixture.CreateContext(); var version = (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion;
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync($"/api/tasks/{root.Id}/move", new { version = root.Version, parentTaskId = root.Id, parentVersion = root.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync($"/api/tasks/{root.Id}/move", new { version = root.Version, parentTaskId = grandchild.Id, parentVersion = grandchild.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.PostAsJsonAsync($"/api/tasks/{root.Id}/move", new { version = root.Version, parentTaskId = foreign.Id, parentVersion = foreign.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.PostAsJsonAsync($"/api/tasks/{root.Id}/move", new { version = root.Version, beforeSiblingId = foreign.Id })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/tasks/{foreign.Id}/subtree")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/tasks/children?parentId={foreign.Id}")).StatusCode);
        Assert.Null((await Get(a, root.Id)).ParentTaskId); Assert.Equal(root.Version, (await Get(a, root.Id)).Version);
        db.ChangeTracker.Clear(); Assert.Equal(version, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task ReorderIsStableAndParentWithActiveChildrenCannotBeArchived()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var root = await Root(c, "Root"); var one = await Child(c, root.Id, "One"); var two = await Child(c, root.Id, "Two"); var three = await Child(c, root.Id, "Three");
        root = await Get(c, root.Id);
        Assert.Equal(HttpStatusCode.OK, (await c.PostAsJsonAsync($"/api/tasks/{three.Id}/move", new { version = three.Version, parentTaskId = root.Id, parentVersion = root.Version, beforeSiblingId = one.Id })).StatusCode);
        for (var i = 0; i < 2; i++)
        {
            var children = await Read<TreePage>(await c.GetAsync($"/api/tasks/children?parentId={root.Id}"));
            Assert.Equal([three.Id, one.Id, two.Id], children.Items.Select(x => x.Id)); Assert.Equal([1024m, 2048m, 3072m], children.Items.Select(x => x.SortOrder));
        }
        root = await Get(c, root.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await c.PostAsJsonAsync($"/api/tasks/{root.Id}/archive", new { version = root.Version })).StatusCode);
    }
    [Fact]
    public async Task KnownParentEstimateNeedsExplicitMeaningAndContainerConversionPreservesBudget()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var parent = await Root(c, "Known direct work");
        await using (var db = fixture.CreateContext()) { var row = await db.Tasks.SingleAsync(x => x.Id == parent.Id); row.DirectEstimatedSeconds = 3600; await db.SaveChangesAsync(); }
        var denied = await c.PostAsJsonAsync($"/api/tasks/{parent.Id}/children", new { title = "Child", parentVersion = parent.Version });
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode); Assert.Contains("parent_work_decision_required", await denied.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Created, (await c.PostAsJsonAsync($"/api/tasks/{parent.Id}/children", new { title = "Child", parentVersion = parent.Version, parentWorkDisposition = "ConvertToContainer" })).StatusCode);
        parent = await Get(c, parent.Id); Assert.False(parent.HasDirectWork); Assert.Null(parent.DirectEstimatedSeconds); Assert.Equal(3600, parent.TargetBudgetSeconds);
        var preserve = await Root(c, "Preserve own work");
        await using (var db = fixture.CreateContext()) { var row = await db.Tasks.SingleAsync(x => x.Id == preserve.Id); row.DirectEstimatedSeconds = 1200; await db.SaveChangesAsync(); }
        Assert.Equal(HttpStatusCode.Created, (await c.PostAsJsonAsync($"/api/tasks/{preserve.Id}/children", new { title = "Child", parentVersion = preserve.Version, parentWorkDisposition = "PreserveDirect" })).StatusCode);
        preserve = await Get(c, preserve.Id); Assert.True(preserve.HasDirectWork); Assert.Equal(1200, preserve.DirectEstimatedSeconds);
    }
    [Fact]
    public async Task ConflictingConcurrentReparentCommandsCannotCreateACycle()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var a = await Root(c, "A"); var b = await Root(c, "B");
        var outcomes = await Task.WhenAll(
            c.PostAsJsonAsync($"/api/tasks/{a.Id}/move", new { version = a.Version, parentTaskId = b.Id, parentVersion = b.Version }),
            c.PostAsJsonAsync($"/api/tasks/{b.Id}/move", new { version = b.Version, parentTaskId = a.Id, parentVersion = a.Version }));
        Assert.Single(outcomes, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(outcomes, x => x.StatusCode == HttpStatusCode.Conflict);
        a = await Get(c, a.Id); b = await Get(c, b.Id);
        Assert.False(a.ParentTaskId == b.Id && b.ParentTaskId == a.Id);
    }
    [Fact]
    public async Task DeepTreeUsesConstantQueryCountAndBoundedPages()
    {
        var counter = new ReaderCounter();
        await using var app = new PlannerFactory(fixture.ConnectionString, services => services.AddDbContext<Adhd.Infrastructure.Persistence.PlannerDbContext>(o => o.AddInterceptors(counter)));
        var (c, userId) = await User(app); var nodes = new List<TaskItem>(); Guid? parent = null;
        for (var i = 0; i < 250; i++)
        {
            var node = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, ParentTaskId = parent, SortOrder = 1024, Title = $"Depth {i}", CreatedAt = app.Clock.Now, UpdatedAt = app.Clock.Now };
            nodes.Add(node); parent = node.Id;
        }
        await using (var db = fixture.CreateContext()) { db.Tasks.AddRange(nodes); await db.SaveChangesAsync(); }
        var before = counter.Count;
        var page = await Read<TreePage>(await c.GetAsync($"/api/tasks/{nodes[0].Id}/subtree?limit=100"));
        Assert.InRange(counter.Count - before, 1, 4);
        Assert.Equal(100, page.Items.Length); Assert.True(page.HasMore); Assert.Equal(nodes[99].Id, page.Items[^1].Id);
        var last = await Read<TreePage>(await c.GetAsync($"/api/tasks/{nodes[0].Id}/subtree?limit=100&offset=200"));
        Assert.Equal(50, last.Items.Length); Assert.False(last.HasMore); Assert.Equal(nodes[249].Id, last.Items[^1].Id);
    }
    private sealed class ReaderCounter : DbCommandInterceptor
    {
        public int Count;
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        { Interlocked.Increment(ref Count); return ValueTask.FromResult(result); }
    }
}
