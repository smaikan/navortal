using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Analytics;
using Adhd.Application.Recurrence;
using Adhd.Application.Tasks;
using Adhd.Domain.Analytics;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

public sealed class RecurrenceAnalyticsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static DateTimeOffset At(int days) => Morning.AddDays(days);
    private static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body) => ManualPlanningTests.Send(s, method, path, JsonSerializer.SerializeToElement(body, Json), null);
    private static async Task<T> Ok<T>(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { Assert.True(r.StatusCode == status, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<T>(r); }
    private static async Task<RecurrenceTemplateView> Create(TaskScenario s, RecurrenceRule? rule = null, string title = "Spor", long? seconds = 1800) =>
        (await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, "/api/recurrence-templates", new RecurrenceCreate(rule ?? new(Today), new(title, EstimatedSeconds: seconds))), HttpStatusCode.Created)).Template;
    private static async Task<Dictionary<DateOnly, Guid>> Generate(TaskScenario s, RecurrenceTemplateView t, DateOnly from, DateOnly to) =>
        (await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/materialize", new MaterializeRecurrence(t.Version, from, to)))).Occurrences.Where(x => x.TaskId.HasValue).ToDictionary(x => x.LocalDate, x => x.TaskId!.Value);
    private static async Task<RecurrenceAnalyticsView> Report(TaskScenario s, DateOnly from, DateOnly to, string extra = "") => await Ok<RecurrenceAnalyticsView>(await s.Client.GetAsync($"/api/analytics/recurrences?fromDate={from:yyyy-MM-dd}&toDate={to:yyyy-MM-dd}{extra}"));
    private static async Task<RecurrenceAnalyticsDetail> Detail(TaskScenario s, Guid id) => await Ok<RecurrenceAnalyticsDetail>(await s.Client.GetAsync($"/api/analytics/recurrences/{id}"));

    [Fact]
    public async Task EachDayGetsOneClassAndOnlyKnownResultsEnterTheRatio()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var t = await Create(s); var tasks = await Generate(s, t, Today, Today.AddDays(5));
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/2026-10-18/skip", new ChangeOccurrence(t.Version, (await s.Get(tasks[Today.AddDays(3)])).Version)));
        await s.State(tasks[Today], TaskAction.Complete);
        app.Clock.Now = At(2); await s.State(tasks[Today.AddDays(1)], TaskAction.Complete);
        app.Clock.Now = At(4); await s.State(tasks[Today.AddDays(4)], TaskAction.Complete);
        app.Clock.Now = At(5); await s.State(tasks[Today.AddDays(4)], TaskAction.Reopen);

        var report = await Report(s, Today, Today.AddDays(5)); var counts = Assert.Single(report.Items).Counts;
        Assert.Equal((2, 1, 1, 1, 1), (counts.OnTime, counts.Late, counts.NotDone, counts.TodayPending, counts.Skipped));
        Assert.Equal(3, counts.Completed); Assert.Equal(4, counts.Total); Assert.Equal(.75m, counts.Consistency);
        Assert.Equal(counts, report.Totals); Assert.Equal(1, report.ActiveCount); Assert.Equal(12, report.Items[0].Weeks.Length); Assert.Equal(3, report.MinimumSamples);

        var detail = await Detail(s, t.Id);
        Assert.Equal([RecurrenceDayClass.OnTime, RecurrenceDayClass.Late, RecurrenceDayClass.NotDone, RecurrenceDayClass.Skipped, RecurrenceDayClass.OnTime, RecurrenceDayClass.TodayPending], detail.Days.Select(x => x.Class));
        Assert.Equal(2, detail.LongestRun); Assert.Equal(4, detail.Recent.Total); Assert.Equal(0, detail.Prior.Total);
    }

    [Fact]
    public async Task TodayCountsOnlyWhenDoneAndEmptyDenominatorIsNull()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var t = await Create(s); var tasks = await Generate(s, t, Today, Today);
        var open = Assert.Single((await Report(s, Today, Today)).Items).Counts; Assert.Equal((0, 1), (open.Total, open.TodayPending)); Assert.Null(open.Consistency);
        await s.State(tasks[Today], TaskAction.Complete);
        var done = Assert.Single((await Report(s, Today, Today)).Items).Counts; Assert.Equal((1, 0, 1m), (done.Total, done.TodayPending, done.Consistency!.Value));
    }

    [Fact]
    public async Task MissingDaysAreVisibleButOutsideTheRatioAndFollowTheDefinitionOfThatDay()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var t = await Create(s, new(Today, Frequency: RecurrenceFrequency.Weekly, WeekDays: [1]));
        var next = await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Put, $"/api/recurrence-templates/{t.Id}", new { version = t.Version, effectiveFrom = new DateOnly(2026, 10, 26), rule = new RecurrenceRule(Today, Frequency: RecurrenceFrequency.Weekly, WeekDays: [3]), task = new RecurringTaskDefaults("Spor", EstimatedSeconds: 1800), refreshExisting = false }));
        app.Clock.Now = new DateTimeOffset(2026, 11, 2, 6, 0, 0, TimeSpan.Zero);
        var report = await Report(s, Today, new DateOnly(2026, 11, 2)); var counts = Assert.Single(report.Items).Counts;
        // 19 Ekim Pazartesi ve 28 Ekim Çarşamba kurala uyuyor. 26 Ekim artık rutin günü değil.
        Assert.Equal(2, counts.NotGenerated); Assert.Equal(0, counts.Total); Assert.Null(counts.Consistency);
    }

    [Fact]
    public async Task PausedRoutineListsOnlyWithTasksInPeriodAndComparisonUsesItsOwnRange()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var active = await Create(s, title: "Etkin"); var paused = await Create(s, title: "Pasif"); var tasks = await Generate(s, active, Today, Today); await s.State(tasks[Today], TaskAction.Complete);
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Put, $"/api/recurrence-templates/{paused.Id}/enabled", new { version = paused.Version, enabled = false }));
        app.Clock.Now = At(7);
        var report = await Report(s, Today.AddDays(7), Today.AddDays(7), "&compareFromDate=2026-10-15&compareToDate=2026-10-15");
        Assert.Equal("Etkin", Assert.Single(report.Items).Title); Assert.Equal(1, report.Total); Assert.Equal(1, report.Compare!.Completed); Assert.Equal(0, report.Totals.Completed);
    }

    [Fact]
    public async Task RowsAreSortedByConsistencyWithSmallSamplesLast()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var low = await Create(s, title: "Düşük"); var high = await Create(s, title: "Yüksek"); var small = await Create(s, title: "Az");
        var a = await Generate(s, low, Today, Today.AddDays(3)); var b = await Generate(s, high, Today, Today.AddDays(3)); var c = await Generate(s, small, Today, Today);
        foreach (var day in b.Keys) { app.Clock.Now = At(day.DayNumber - Today.DayNumber); await s.State(b[day], TaskAction.Complete); }
        app.Clock.Now = Morning; await s.State(a[Today], TaskAction.Complete); await s.State(c[Today], TaskAction.Complete); app.Clock.Now = At(4);
        Assert.Equal(["Yüksek", "Düşük", "Az"], (await Report(s, Today, Today.AddDays(3))).Items.Select(x => x.Title));
        var page = await Report(s, Today, Today.AddDays(3), "&offset=1&limit=1"); Assert.Equal("Düşük", Assert.Single(page.Items).Title); Assert.Equal(3, page.Total);
    }

    [Fact]
    public async Task WorkSummaryUsesRecordedTimeOfCompletedTasksOnly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var t = await Create(s, seconds: 1800); var tasks = await Generate(s, t, Today, Today.AddDays(1));
        Assert.True((await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = tasks[Today], startedAt = Morning.AddHours(-1), endedAt = Morning.AddMinutes(-30), reason = "Rutin" })).IsSuccessStatusCode);
        await s.State(tasks[Today], TaskAction.Complete); app.Clock.Now = At(1); await s.State(tasks[Today.AddDays(1)], TaskAction.Complete);
        var work = (await Detail(s, t.Id)).Work;
        Assert.Equal(1800m, work.TotalSeconds); Assert.Equal(1, work.SampleCount); Assert.Equal(1800m, work.AverageSeconds); Assert.Equal(1, work.ExcludedWithoutWorkCount); Assert.Equal(1800, work.EstimatedSeconds);
    }

    [Fact]
    public async Task OwnerIsolationAndQueryLimitsAreEnforced()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var owner = await TaskScenario.User(app); var other = await TaskScenario.User(app); var t = await Create(owner);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/analytics/recurrences/{t.Id}")).StatusCode); Assert.Empty((await Report(other, Today, Today)).Items);
        foreach (var query in new[] { "fromDate=2026-10-15&toDate=2026-10-14", "fromDate=2025-01-01&toDate=2026-10-15", "fromDate=2026-10-15&toDate=2026-10-15&compareFromDate=2026-10-14", "fromDate=2026-10-15&toDate=2026-10-15&limit=101" })
            Assert.Equal(HttpStatusCode.BadRequest, (await owner.Client.GetAsync($"/api/analytics/recurrences?{query}")).StatusCode);
    }
}
