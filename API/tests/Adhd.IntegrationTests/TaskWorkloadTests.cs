using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Auth;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class TaskWorkloadTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static async Task<T> Read<T>(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<T>(Json))!;
    private static async Task<(HttpClient Client, Guid Id)> User(PlannerFactory app)
    {
        var c = app.CreateClient(); var auth = await Read<AuthResponse>(await c.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" }));
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken); return (c, auth.User.Id);
    }
    private static async Task<TaskView> Get(HttpClient c, Guid id) => await Read<TaskView>(await c.GetAsync($"/api/tasks/{id}"));
    private static async Task<TaskView> Root(HttpClient c) => await Read<TaskView>(await c.PostAsJsonAsync("/api/tasks", new { title = "Project" }));
    private static async Task<TaskView> Child(HttpClient c, Guid id)
    {
        var parent = await Get(c, id);
        var response = await c.PostAsJsonAsync($"/api/tasks/{id}/children", new { title = "Step", parentVersion = parent.Version, parentWorkDisposition = parent.HasDirectWork && parent.DirectEstimatedSeconds.HasValue ? "PreserveDirect" : null });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await Read<TaskView>(response);
    }
    private static async Task<TaskView> Define(HttpClient c, Guid id, bool hasDirectWork, long? seconds = null, long? budget = null)
    {
        var task = await Get(c, id);
        var response = await c.PutAsJsonAsync($"/api/tasks/{id}/work-definition", new { version = task.Version, hasDirectWork, directEstimatedSeconds = seconds, targetBudgetSeconds = budget });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode); return await Read<TaskView>(response);
    }
    private static async Task<WorkloadSummary> Summary(HttpClient c, Guid id) => await Read<WorkloadSummary>(await c.GetAsync($"/api/tasks/{id}/workload"));
    [Fact]
    public async Task Nested115MinutesAndBudgetAreCalculatedFromPersistedDirectWorkOnly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var root = await Root(c); var visual = await Child(c, root.Id); var info = await Child(c, root.Id); var review = await Child(c, root.Id);
        var a = await Child(c, info.Id); var b = await Child(c, info.Id); var d = await Child(c, info.Id);
        foreach (var (id, minutes) in new[] { (visual.Id, 30), (a.Id, 15), (b.Id, 20), (d.Id, 25), (review.Id, 25) }) await Define(c, id, true, minutes * 60);
        await Define(c, root.Id, false, budget: 240 * 60);
        var summary = await Summary(c, root.Id);
        Assert.Equal(115 * 60, summary.CalculatedTotalSeconds); Assert.Equal(125 * 60, summary.TargetDifferenceSeconds);
        var components = await Read<WorkComponentPage>(await c.GetAsync($"/api/tasks/{root.Id}/work-components"));
        Assert.Equal(5, components.Total); Assert.Equal(115 * 60, components.Items.Sum(x => x.EstimatedSeconds));
        Assert.DoesNotContain(components.Items, x => x.TaskId == root.Id || x.TaskId == info.Id);
        await Define(c, a.Id, true, 30 * 60);
        Assert.Equal(130 * 60, (await Summary(c, root.Id)).CalculatedTotalSeconds);
    }
    [Fact]
    public async Task UnknownEstimatesRemainVisibleAndBudgetDoesNotBecomeExtraWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var root = await Root(c); var known = await Child(c, root.Id); var unknown = await Child(c, root.Id); _ = await Child(c, root.Id);
        await Define(c, known.Id, true, 90 * 60); await Define(c, root.Id, false, budget: 240 * 60);
        var summary = await Summary(c, root.Id); Assert.Equal(90 * 60, summary.KnownEstimatedSeconds); Assert.Equal(2, summary.UnknownEstimateCount);
        Assert.Null(summary.CalculatedTotalSeconds); Assert.Null(summary.TargetDifferenceSeconds);
        Assert.Equal(3, (await Read<WorkComponentPage>(await c.GetAsync($"/api/tasks/{root.Id}/work-components"))).Total);
        await Define(c, unknown.Id, true, 0); summary = await Summary(c, root.Id);
        Assert.Equal(1, summary.UnknownEstimateCount); Assert.Equal(90 * 60, summary.KnownEstimatedSeconds);
    }
    [Fact]
    public async Task ParentOwnWorkAndMovingChildUpdateTotalsWithoutDuplicatingEitherIdentity()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var a = await Root(c); await Define(c, a.Id, true, 20 * 60);
        var child = await Child(c, a.Id); child = await Define(c, child.Id, true, 40 * 60);
        Assert.Equal(60 * 60, (await Summary(c, a.Id)).CalculatedTotalSeconds);
        Assert.Equal(2, (await Read<WorkComponentPage>(await c.GetAsync($"/api/tasks/{a.Id}/work-components"))).Total);
        var b = await Root(c);
        Assert.Equal(HttpStatusCode.OK, (await c.PostAsJsonAsync($"/api/tasks/{child.Id}/move", new { version = child.Version, parentTaskId = b.Id, parentVersion = b.Version })).StatusCode);
        Assert.Equal(20 * 60, (await Summary(c, a.Id)).CalculatedTotalSeconds); Assert.Equal(40 * 60, (await Summary(c, b.Id)).CalculatedTotalSeconds);
        Assert.Equal(child.Id, Assert.Single((await Read<WorkComponentPage>(await c.GetAsync($"/api/tasks/{b.Id}/work-components"))).Items).TaskId);
    }
    [Fact]
    public async Task InvalidStaleAndForeignDefinitionsLeaveExistingDataIntact()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, userId) = await User(app); var (other, _) = await User(app);
        var root = await Root(c); root = await Define(c, root.Id, true, 600);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync($"/api/tasks/{root.Id}/work-definition", new { version = root.Version, hasDirectWork = false, directEstimatedSeconds = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PutAsJsonAsync($"/api/tasks/{root.Id}/work-definition", new { version = root.Version, hasDirectWork = true, directEstimatedSeconds = -1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await c.PutAsJsonAsync($"/api/tasks/{root.Id}/work-definition", new { version = 1, hasDirectWork = true, directEstimatedSeconds = 900 })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await c.PutAsJsonAsync($"/api/tasks/{root.Id}/work-definition", new { version = root.Version, hasDirectWork = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync($"/api/tasks/{root.Id}/work-definition", new { version = root.Version, hasDirectWork = true })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/tasks/{root.Id}/workload")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/tasks/{root.Id}/work-components")).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(600, (await db.Tasks.SingleAsync(x => x.Id == root.Id)).DirectEstimatedSeconds);
        Assert.Equal(2, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task OverflowingDefinitionOrMoveRollsBackAndNeverWrapsToNegativeDuration()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (c, _) = await User(app);
        var root = await Root(c); await Define(c, root.Id, true, long.MaxValue);
        var child = await Child(c, root.Id); child = await Define(c, child.Id, true, 0);
        var failed = await c.PutAsJsonAsync($"/api/tasks/{child.Id}/work-definition", new { version = child.Version, hasDirectWork = true, directEstimatedSeconds = 1 });
        Assert.Equal(HttpStatusCode.BadRequest, failed.StatusCode); Assert.Contains("workload_overflow", await failed.Content.ReadAsStringAsync());
        Assert.Equal(0, (await Get(c, child.Id)).DirectEstimatedSeconds); Assert.Equal(child.Version, (await Get(c, child.Id)).Version);
        var another = await Root(c); another = await Define(c, another.Id, true, 1); root = await Get(c, root.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await c.PostAsJsonAsync($"/api/tasks/{another.Id}/move", new { version = another.Version, parentTaskId = root.Id, parentVersion = root.Version, parentWorkDisposition = "PreserveDirect" })).StatusCode);
        Assert.Null((await Get(c, another.Id)).ParentTaskId); Assert.Equal(long.MaxValue, (await Summary(c, root.Id)).CalculatedTotalSeconds);
    }
}
