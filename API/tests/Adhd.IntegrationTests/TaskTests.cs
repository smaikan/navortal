using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Auth;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class TaskTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static async Task<T> Read<T>(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<T>(Json))!;
    private static async Task<(HttpClient Client, Guid Id)> User(PlannerFactory app)
    {
        var client = app.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" });
        var auth = await Read<AuthResponse>(response);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.Id);
    }
    private static async Task<TaskView> Create(HttpClient client, string title = "First small step")
    {
        var response = await client.PostAsJsonAsync("/api/tasks", new { title });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        return await Read<TaskView>(response);
    }
    [Fact]
    public async Task TitleOnlyTaskCanBeUpdatedAndArchivedWithImmutableEventsAndUnknownEstimate()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        var task = await Create(client, "  Read one page  ");
        Assert.Equal("Read one page", task.Title); Assert.Null(task.DirectEstimatedSeconds);
        Assert.Equal(TaskState.Pending, task.State); Assert.True(task.CanSplit); Assert.Equal(1, task.Version);
        Assert.Equal(app.Clock.Now.ToUnixTimeMilliseconds(), task.CreatedAt.ToUnixTimeMilliseconds());
        app.Clock.Now = app.Clock.Now.AddMinutes(2);
        var updated = await Read<TaskView>(await client.PutAsJsonAsync($"/api/tasks/{task.Id}", new
        { version = 1, title = "Read two pages", description = "One step at a time", priority = "High", canSplit = false, deadlineAt = "2026-11-01T12:00:00+03:00" }));
        Assert.Equal(2, updated.Version); Assert.Equal(TaskPriority.High, updated.Priority); Assert.False(updated.CanSplit);
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 9, 0, 0, TimeSpan.Zero), updated.DeadlineAt);
        var archived = await Read<TaskView>(await client.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = 2 }));
        Assert.Equal(3, archived.Version); Assert.NotNull(archived.ArchivedAt);
        Assert.Empty((await Read<TaskPage>(await client.GetAsync("/api/tasks"))).Items);
        Assert.Single((await Read<TaskPage>(await client.GetAsync("/api/tasks?includeArchived=true"))).Items);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = 3, title = "Cannot edit archive" })).StatusCode);
        await using var db = fixture.CreateContext();
        var events = await db.TaskEvents.Where(x => x.TaskId == task.Id).OrderBy(x => x.Id).ToArrayAsync();
        Assert.Equal(["Created", "Updated", "Archived"], events.Select(x => x.Type));
        Assert.All(events, e => Assert.Equal(userId, e.UserId));
        using var original = JsonDocument.Parse(events[0].Payload);
        Assert.Equal("Read one page", original.RootElement.GetProperty("after").GetProperty("Title").GetString());
        Assert.Equal(3, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task TwoUsersCannotReadWriteOrArchiveEachOthersTasksAndForgedServerFieldsAreIgnored()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (a, aId) = await User(app); var (b, bId) = await User(app);
        var create = await a.PostAsJsonAsync("/api/tasks", new { title = "My task", userId = bId, state = "Completed", directEstimatedSeconds = 999, actualSeconds = 777, completedAt = "2020-01-01T00:00:00Z", version = 99 });
        var task = await Read<TaskView>(create); Assert.Equal(1, task.Version); Assert.Equal(TaskState.Pending, task.State); Assert.Null(task.DirectEstimatedSeconds);
        Assert.Empty((await Read<TaskPage>(await b.GetAsync("/api/tasks"))).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await b.GetAsync($"/api/tasks/{task.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = 1, title = "Stolen" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/tasks")).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(aId, (await db.Tasks.SingleAsync(x => x.Id == task.Id)).UserId);
    }
    [Fact]
    public async Task ConcurrentUpdatesWithTheSameVersionHaveOneWinnerAndNoLostAudit()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        var task = await Create(client);
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(i => client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = 1, title = $"Edit {i}" })));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK); Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        await using var db = fixture.CreateContext();
        Assert.Equal(2, (await db.Tasks.SingleAsync(x => x.Id == task.Id)).Version);
        Assert.Equal(2, await db.TaskEvents.CountAsync(x => x.TaskId == task.Id));
        Assert.Equal(2, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task PaginationFilteringAndLiteralSearchAreBoundedAndStable()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        await using (var db = fixture.CreateContext())
        {
            db.Tasks.AddRange(Enumerable.Range(0, 105).Select(i => new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, Title = $"Seed {i}", CreatedAt = app.Clock.Now, UpdatedAt = app.Clock.Now }));
            await db.SaveChangesAsync();
        }
        var task = await Create(client, "100%_UniqueNeedle");
        var first = await Read<TaskPage>(await client.GetAsync("/api/tasks?limit=100"));
        var second = await Read<TaskPage>(await client.GetAsync("/api/tasks?limit=100&offset=100"));
        Assert.Equal(106, first.Total); Assert.Equal(100, first.Items.Length); Assert.Equal(6, second.Items.Length);
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(second.Items.Select(x => x.Id)));
        var search = await Read<TaskPage>(await client.GetAsync("/api/tasks?search=100%25_unique"));
        Assert.Equal(task.Id, Assert.Single(search.Items).Id);
        Assert.Empty((await Read<TaskPage>(await client.GetAsync("/api/tasks?priority=Urgent"))).Items);
        foreach (var query in new[] { "limit=101", "offset=-1", "priority=400" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/tasks?" + query)).StatusCode);
    }
    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task InvalidTasksDoNotCreateEventsOrAdvancePlanningVersion(string title)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/tasks", new { title })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/tasks", new { title = "Valid", priority = 99 })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.False(await db.Tasks.AnyAsync(x => x.UserId == userId));
        Assert.False(await db.TaskEvents.AnyAsync(x => x.UserId == userId));
        Assert.Equal(0, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task DatabaseRejectsCrossUserEventAndProtectsTaskHistoryFromHardDelete()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (a, _) = await User(app); var (_, bId) = await User(app);
        var task = await Create(a);
        await using var db = fixture.CreateContext();
        db.TaskEvents.Add(new TaskEvent { Id = Guid.CreateVersion7(), UserId = bId, TaskId = task.Id, Type = "Forged", Sequence = 1, EffectiveAt = app.Clock.Now });
        var mismatch = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, Assert.IsType<PostgresException>(mismatch.InnerException).SqlState);
        db.ChangeTracker.Clear();
        var deletion = await Assert.ThrowsAsync<PostgresException>(async () => await db.Tasks.Where(x => x.Id == task.Id).ExecuteDeleteAsync());
        Assert.Equal(PostgresErrorCodes.RestrictViolation, deletion.SqlState);
        Assert.True(await db.Tasks.AnyAsync(x => x.Id == task.Id));
    }
    [Fact]
    public async Task EventWriteFailureRollsBackTaskAndPlanningVersionTogether()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_task_event_test() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW."Payload"->'after'->>'Title' = 'Rollback sentinel' THEN RAISE EXCEPTION 'test write failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_task_event_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_task_event_test();
            """);
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await client.PostAsJsonAsync("/api/tasks", new { title = "Rollback sentinel" })).StatusCode);
            Assert.False(await db.Tasks.AnyAsync(x => x.UserId == userId)); Assert.False(await db.TaskEvents.AnyAsync(x => x.UserId == userId));
            Assert.Equal(0, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_task_event_test ON task_events; DROP FUNCTION reject_task_event_test();"); }
    }
}
