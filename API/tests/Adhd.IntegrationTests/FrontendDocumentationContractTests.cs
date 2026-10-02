using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Auth;
using Adhd.Application.Notifications;
using Adhd.Application.Sync;
using Adhd.Application.Tasks;
using Adhd.Application.Work;

namespace Adhd.IntegrationTests;

public sealed class FrontendDocumentationContractTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Theory]
    [InlineData("POST", "/api/schedules", "{\"kind\":null}", "Kind")]
    [InlineData("POST", "/api/tasks/11111111-1111-4111-8111-111111111111/state", "{\"version\":1,\"action\":null}", "Action")]
    [InlineData("POST", "/api/focus-presets", "{\"name\":\"Preset\",\"settings\":null}", "Settings")]
    [InlineData("PUT", "/api/focus-presets/11111111-1111-4111-8111-111111111111", "{\"version\":1,\"name\":\"Preset\",\"settings\":null}", "Settings")]
    public async Task RequiredInputsRejectNullEvenWhenMetadataUnionContainsNull(string method, string path, string json, string field)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var user = await TaskScenario.User(app);
        using var request = new HttpRequestMessage(new HttpMethod(method), path)
        { Content = new StringContent(json, System.Text.Encoding.UTF8, "application/json") };
        using var response = await user.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("validation_failed", body.RootElement.GetProperty("code").GetString());
        Assert.Contains(body.RootElement.GetProperty("errors").EnumerateObject(), p => p.Name.Equals(field, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task OmittedDisplayNameUsesTheEntireTrimmedEmail()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var email = $"{Guid.NewGuid():N}@example.test";
        using var client = app.CreateClient();
        using var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "123456" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auth = await TaskScenario.Read<AuthResponse>(response);
        Assert.Equal(email, auth.User.DisplayName);
    }

    [Fact]
    public async Task ArbitraryIdempotencyHeaderDoesNotDeduplicateTaskCreate()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var user = await TaskScenario.User(app); var key = Guid.NewGuid().ToString();
        async Task<TaskView> Create()
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/tasks") { Content = JsonContent.Create(new { title = "Same intent, unsupported key" }) };
            request.Headers.Add("Idempotency-Key", key);
            using var response = await user.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            return await TaskScenario.Read<TaskView>(response);
        }
        var first = await Create(); var second = await Create();
        Assert.NotEqual(first.Id, second.Id);
        var page = await TaskScenario.Read<TaskPage>(await user.Client.GetAsync("/api/tasks"));
        Assert.Equal(2, page.Total);
    }

    [Fact]
    public async Task PausedWorkIsAbsentFromCurrentButRecoverableThroughSync()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var user = await TaskScenario.User(app); var task = await user.Root();
        var work = await WorkSessionTests.Started(user, task.Id);
        work = await WorkSessionTests.Change(user, work, "pause");
        var current = await TaskScenario.Read<CurrentWork>(await user.Client.GetAsync("/api/work-sessions/current"));
        var sync = await TaskScenario.Read<SyncView>(await user.Client.GetAsync("/api/sync"));
        Assert.Null(current.ActiveSession);
        Assert.Equal(work.Id, sync.WorkSessionId);
        var detail = await TaskScenario.Read<WorkView>(await user.Client.GetAsync($"/api/work-sessions/{sync.WorkSessionId}"));
        Assert.Equal(Adhd.Domain.Work.WorkState.Paused, detail.State);
        Assert.Equal(work.Version, detail.Version);
    }

    [Fact]
    public async Task ReminderUpdateRequiresVersionEvenThoughItsInputTypeIsNullable()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var user = await TaskScenario.User(app); var dueAt = app.Clock.Now.AddHours(1);
        using var create = new HttpRequestMessage(HttpMethod.Post, "/api/notifications/reminders") { Content = JsonContent.Create(new { title = "Reminder", dueAt }) };
        create.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        using var created = await user.Client.SendAsync(create);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var reminder = await TaskScenario.Read<CustomReminderView>(created);
        using var update = new HttpRequestMessage(HttpMethod.Put, $"/api/notifications/reminders/{reminder.Id}") { Content = JsonContent.Create(new { title = "Changed", dueAt }) };
        update.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        using var rejected = await user.Client.SendAsync(update);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await rejected.Content.ReadAsStringAsync());
        Assert.Equal("version_conflict", body.RootElement.GetProperty("code").GetString());
        var items = await TaskScenario.Read<CustomReminderView[]>(await user.Client.GetAsync("/api/notifications/reminders"));
        Assert.Equal("Reminder", Assert.Single(items).Title);
    }
}
