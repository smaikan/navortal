using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Runtime.InteropServices;
using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Collections;
using Adhd.Application.Notifications;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class BackendReleaseTests
{
    [Fact]
    public void DocumentationRedactionPreservesValidationArraysWhileRemovingCredentialValues()
    {
        var request = ApiTranscriptStartupFilter.Clean("""{"password":"private-value","currentPassword":"private-current","newPassword":"private-new","accessToken":"private-token","keys":{"auth":"private-auth"}}""")!;
        Assert.DoesNotContain("private-", request.ToJsonString()); Assert.Equal("123456", request["password"]!.GetValue<string>());
        var problem = ApiTranscriptStartupFilter.Clean("""{"code":"validation_failed","errors":{"NewPassword":["Minimum 6 characters."],"Email":["Invalid email."]}}""")!;
        Assert.Equal("Minimum 6 characters.", problem["errors"]!["NewPassword"]![0]!.GetValue<string>());
    }
    [Fact]
    public async Task OptionalResourceReadsAndVersionedRemovalHaveRealSuccessfulHttpContracts()
    {
        await using var s = await JobScenario.Create();
        foreach (var path in new[] { "/api/support/days/2026-10-15", "/api/jobs/reminders", "/api/notifications/push-config", "/api/notifications/reminders", "/api/notifications/subscriptions" })
            Assert.Equal(HttpStatusCode.OK, (await s.User.Client.GetAsync(path)).StatusCode);
        foreach (var kind in new[] { "categories", "tags" })
        {
            var resource = await TaskScenario.Read<NamedResourceView>(await s.User.Client.PostAsJsonAsync($"/api/{kind}", new { name = "Örnek sınıflandırma" }));
            Assert.Equal(HttpStatusCode.OK, (await s.User.Client.GetAsync($"/api/{kind}/{resource.Id}/workload")).StatusCode);
        }
        var first = await s.User.Root("Önce"); var second = await s.User.Root("Sonra");
        Assert.Equal(HttpStatusCode.Created, (await s.User.Client.PostAsJsonAsync($"/api/tasks/{second.Id}/ordering", new { version = second.Version, beforeTaskId = first.Id })).StatusCode);
        second = await s.User.Get(second.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await s.User.Client.DeleteAsync($"/api/tasks/{second.Id}/ordering/{first.Id}?version={second.Version}")).StatusCode);
        var created = await Send(s.User, HttpMethod.Post, "/api/notifications/reminders", new { title = "İlk hatırlatma", dueAt = s.App.Clock.Now.AddMinutes(10) });
        var reminder = await TaskScenario.Read<CustomReminderView>(created);
        var updated = await Send(s.User, HttpMethod.Put, $"/api/notifications/reminders/{reminder.Id}", new { version = reminder.Version, title = "Düzenlenen hatırlatma", dueAt = s.App.Clock.Now.AddMinutes(20) });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        Assert.Equal(reminder.Id, (await TaskScenario.Read<CustomReminderView>(updated)).Id);
        var subscription = await TaskScenario.Read<SubscriptionView>(await s.User.Client.PostAsJsonAsync("/api/notifications/subscriptions", NotificationTests.Subscription("https://push.example.test/documentation")));
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.GetAsync("/api/notifications/subscriptions")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await s.User.Client.PostAsJsonAsync($"/api/notifications/subscriptions/{subscription.Id}/remove", new { version = subscription.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.GetAsync("/api/notifications/reminders")).StatusCode);
    }

    [Fact]
    public async Task ThousandTasksDeepTreeAndYearOfEffectiveWorkRemainCorrectThroughPagedHttpQueries()
    {
        await using var s = await JobScenario.Create();
        var ids = Enumerable.Range(0, 1000).Select(_ => Guid.NewGuid()).ToArray();
        var firstDay = new DateOnly(2025, 10, 16);
        await using (var db = s.Context())
        {
            for (var i = 0; i < ids.Length; i++)
                db.Tasks.Add(new TaskItem { Id = ids[i], UserId = s.User.UserId, Title = $"Load {i:D4}", ParentTaskId = i is > 0 and < 128 ? ids[i - 1] : null, DirectEstimatedSeconds = 900, SortOrder = i, CreatedAt = s.App.Clock.Now.AddYears(-1), UpdatedAt = s.App.Clock.Now });
            for (var i = 0; i < 365; i++)
            {
                var start = new DateTimeOffset(firstDay.AddDays(i).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                var session = new WorkSession { Id = Guid.NewGuid(), UserId = s.User.UserId, TaskId = ids[500 + i], State = WorkState.Finished, Source = WorkSource.Manual, StartedAt = start, EndedAt = start.AddHours(1), RecordedAt = start.AddHours(1) };
                db.WorkSessions.Add(session);
                db.Set<WorkSessionSegment>().Add(new() { Id = Guid.NewGuid(), UserId = s.User.UserId, SessionId = session.Id, StartedAt = start, EndedAt = start.AddHours(1) });
            }
            await db.SaveChangesAsync();
        }
        var samples = new Dictionary<string, List<double>>();
        async Task<T> Measure<T>(string name, string path)
        {
            var timer = Stopwatch.StartNew(); var response = await s.User.Client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode); var value = await TaskScenario.Read<T>(response); timer.Stop();
            if (!samples.TryGetValue(name, out var values)) samples[name] = values = [];
            values.Add(timer.Elapsed.TotalMilliseconds); return value;
        }
        for (var i = 0; i < 11; i++)
        {
            using var page = await Measure<JsonDocument>("taskPage", "/api/tasks?offset=100&limit=50");
            Assert.Equal(1000, page.RootElement.GetProperty("total").GetInt32()); Assert.Equal(50, page.RootElement.GetProperty("items").GetArrayLength());
            using var tree = await Measure<JsonDocument>("deepSubtree", $"/api/tasks/{ids[0]}/subtree?offset=0&limit=50");
            Assert.True(tree.RootElement.GetProperty("hasMore").GetBoolean()); Assert.Equal(50, tree.RootElement.GetProperty("items").GetArrayLength());
            var actual = await Measure<ActualAnalyticsView>("yearActual", "/api/analytics/actual?fromDate=2025-10-16&toDate=2026-10-15&bucket=Month");
            Assert.Equal(365 * 3600m, actual.Totals.WorkSeconds); Assert.Equal(365, actual.Totals.SessionCount); Assert.Equal(0m, actual.Totals.Focus.ActiveSeconds);
        }
        var lastPage = await TaskScenario.Read<TreePage>(await s.User.Client.GetAsync($"/api/tasks/{ids[0]}/subtree?offset=100&limit=50"));
        Assert.False(lastPage.HasMore); Assert.Equal(28, lastPage.Items.Length); Assert.Equal(ids[127], lastPage.Items[^1].Id);
        var workload = await TaskScenario.Read<WorkloadSummary>(await s.User.Client.GetAsync($"/api/tasks/{ids[0]}/workload"));
        Assert.Equal(128 * 900, workload.CalculatedTotalSeconds);
        var output = Environment.GetEnvironmentVariable("ADHD_QUERY_BENCHMARK");
        if (!string.IsNullOrWhiteSpace(output))
        {
            var report = new { framework = RuntimeInformation.FrameworkDescription, os = RuntimeInformation.OSDescription, logicalProcessors = Environment.ProcessorCount, taskCount = 1000, depth = 128, historyDays = 365, historySegments = 365, warmupCount = 1, sampleCount = 10,
                scope = "Real PostgreSQL + TestServer HTTP + JSON deserialization; sequential warm queries, fixture creation excluded; no external network or browser",
                milliseconds = samples.ToDictionary(x => x.Key, x => { var a = x.Value.Skip(1).Order().ToArray(); return new { min = a[0], median = (a[4] + a[5]) / 2, p95 = a[9], max = a[^1], samples = x.Value.Skip(1).ToArray() }; }) };
            await File.WriteAllTextAsync(output, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
        }
    }
}
