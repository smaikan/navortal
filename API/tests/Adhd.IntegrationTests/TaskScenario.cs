using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Auth;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

internal sealed class TaskScenario(HttpClient client, Guid userId)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    internal HttpClient Client => client;
    internal Guid UserId => userId;
    internal static async Task<T> Read<T>(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<T>(Json))!;
    internal static async Task<TaskScenario> User(PlannerFactory app)
    {
        var c = app.CreateClient(); var response = await c.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); var auth = await Read<AuthResponse>(response);
        c.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken); return new(c, auth.User.Id);
    }
    internal async Task<TaskView> Root(string title = "Project") => await Read<TaskView>(await client.PostAsJsonAsync("/api/tasks", new { title }));
    internal async Task<TaskView> Get(Guid id) => await Read<TaskView>(await client.GetAsync($"/api/tasks/{id}"));
    internal async Task<TaskView> Child(Guid parentId, string title = "Step")
    {
        var p = await Get(parentId);
        var result = await client.PostAsJsonAsync($"/api/tasks/{parentId}/children", new
        { title, parentVersion = p.Version, parentWorkDisposition = p.HasDirectWork && (p.DirectEstimatedSeconds.HasValue || p.DirectWorkCompleted) ? "PreserveDirect" : null });
        Assert.Equal(HttpStatusCode.Created, result.StatusCode); return await Read<TaskView>(result);
    }
    internal async Task<TaskView> Define(Guid id, bool direct, long? seconds = null, long? budget = null)
    {
        var task = await Get(id); var result = await client.PutAsJsonAsync($"/api/tasks/{id}/work-definition", new { version = task.Version, hasDirectWork = direct, directEstimatedSeconds = seconds, targetBudgetSeconds = budget });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode); return await Read<TaskView>(result);
    }
    internal async Task<TaskView> State(Guid id, TaskAction action, ParentCompletionChoice? choice = null)
    {
        var task = await Get(id); var result = await client.PostAsJsonAsync($"/api/tasks/{id}/state", new { version = task.Version, action = action.ToString(), parentCompletionChoice = choice?.ToString() });
        Assert.Equal(HttpStatusCode.OK, result.StatusCode); return await Read<TaskView>(result);
    }
}
