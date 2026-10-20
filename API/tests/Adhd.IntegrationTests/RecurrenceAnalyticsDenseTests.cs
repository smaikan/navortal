using System.Diagnostics;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Analytics;
using Adhd.Application.Recurrence;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

// Yoğun veri ölçümü. Sadece ADHD_PERF_OUT verilince koşar; sonuçları o dosyaya yazar.
public sealed class RecurrenceAnalyticsDenseTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private const int Routines = 50, Days = 366;
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    [Fact]
    public async Task FiftyDailyRoutinesOverAYearStayWithinTheReadBudget()
    {
        var output = Environment.GetEnvironmentVariable("ADHD_PERF_OUT"); if (string.IsNullOrEmpty(output)) return;
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var first = Today.AddDays(-(Days - 1)); var templates = new List<RecurrenceTemplateView>();
        for (var i = 0; i < Routines; i++)
        {
            var response = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/recurrence-templates", JsonSerializer.SerializeToElement(new RecurrenceCreate(new(first), new($"Rutin {i}", EstimatedSeconds: 600)), Json), null);
            Assert.Equal(HttpStatusCode.Created, response.StatusCode); templates.Add((await TaskScenario.Read<RecurrenceEffect>(response)).Template);
        }
        var seed = Stopwatch.StartNew();
        foreach (var t in templates)
        {
            await using var db = fixture.CreateContext();
            for (var i = 0; i < Days; i++)
            {
                var date = first.AddDays(i); var at = new DateTimeOffset(date.ToDateTime(new TimeOnly(9, 0)), TimeSpan.Zero); var done = i % 4 != 0; var id = Guid.CreateVersion7();
                db.Tasks.Add(new TaskItem { Id = id, UserId = s.UserId, Title = t.Task.Title, State = done ? TaskState.Completed : TaskState.Pending, DirectWorkCompleted = done, CompletedAt = done ? at : null, CompletionOrigin = done ? CompletionOrigin.Manual : null, CreatedAt = at, UpdatedAt = at });
                db.RecurrenceOccurrences.Add(new RecurrenceOccurrence { Id = Guid.CreateVersion7(), UserId = s.UserId, TemplateId = t.Id, DefinitionId = t.DefinitionId, AppliedDefinitionId = t.DefinitionId, LocalDate = date, TimeZoneId = "Europe/Istanbul", TaskId = id, SyncedTaskVersion = 1, State = OccurrenceState.Materialized, CreatedAt = at });
                db.TaskEvents.Add(new TaskEvent { Id = Guid.CreateVersion7(), UserId = s.UserId, TaskId = id, Type = "state", Sequence = 1, EffectiveAt = at, TimeZoneId = "Europe/Istanbul", Payload = done ? "{\"after\":{\"State\":\"Completed\",\"DirectWorkCompleted\":true}}" : "{\"after\":{\"State\":\"Pending\",\"DirectWorkCompleted\":false}}" });
            }
            await db.SaveChangesAsync();
        }
        seed.Stop();
        var lines = new List<string> { $"seed: {Routines} rutin x {Days} gün = {Routines * Days} oluşum, {seed.ElapsedMilliseconds} ms" };
        async Task<long[]> Measure(string path)
        {
            var times = new List<long>();
            for (var i = 0; i < 5; i++) { var watch = Stopwatch.StartNew(); var response = await s.Client.GetAsync(path); Assert.Equal(HttpStatusCode.OK, response.StatusCode); await response.Content.ReadAsByteArrayAsync(); times.Add(watch.ElapsedMilliseconds); }
            return times.ToArray();
        }
        var list = $"/api/analytics/recurrences?fromDate={first:yyyy-MM-dd}&toDate={Today:yyyy-MM-dd}&limit=100"; var month = "/api/analytics/recurrences?fromDate=2026-10-01&toDate=2026-10-15&compareFromDate=2026-09-01&compareToDate=2026-09-15&limit=5";
        lines.Add($"yıl listesi ms: {string.Join(", ", await Measure(list))}"); lines.Add($"ay listesi ms: {string.Join(", ", await Measure(month))}"); lines.Add($"tek rutin ms: {string.Join(", ", await Measure($"/api/analytics/recurrences/{templates[0].Id}"))}");
        var report = await TaskScenario.Read<RecurrenceAnalyticsView>(await s.Client.GetAsync(list));
        lines.Add($"toplam: {report.Totals.Completed}/{report.Totals.Total}, satır {report.Items.Length}");
        await File.WriteAllLinesAsync(output, lines);
        Assert.Equal(Routines, report.Total); Assert.Equal(Routines * Days, report.Totals.Total);
    }
}
