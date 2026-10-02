using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Collections;
using Adhd.Application.Focus;
using Adhd.Application.Preferences;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class ActualAnalyticsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static async Task<ActualAnalyticsView> Report(TaskScenario s, string from = "2026-10-15", string? to = null, string bucket = "Day")
    {
        var r = await s.Client.GetAsync($"/api/analytics/actual?fromDate={from}&toDate={to ?? from}&bucket={bucket}"); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<ActualAnalyticsView>(r);
    }
    private static async Task<WorkView> Manual(TaskScenario s, Guid id, DateTimeOffset start, DateTimeOffset end)
    {
        var r = await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = id, startedAt = start, endedAt = end, reason = "Rapor fixture" }); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<WorkView>(r);
    }
    private static async Task<FocusView> Change(TaskScenario s, FocusView f, string action)
    {
        var response = await Send(s, HttpMethod.Post, $"/api/focus-sessions/{f.Id}/{action}", new { version = f.Version, workSessionVersion = f.WorkSessionVersion });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); return await TaskScenario.Read<FocusView>(response);
    }
    private static async Task Zone(TaskScenario s, string zone)
    {
        var p = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); Assert.True((await s.Client.PutAsJsonAsync("/api/preferences", new { version = p.Version, values = p.Values with { TimeZoneId = zone } })).IsSuccessStatusCode);
    }
    [Fact]
    public async Task DirectParentChildAndGeneralFocusAreCountedOnceAndPauseIsExcluded()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddMinutes(40); var s = await TaskScenario.User(app);
        var parent = await s.Root(); await s.Define(parent.Id, true, 600); var child = await s.Child(parent.Id); await Manual(s, parent.Id, Morning, Morning.AddMinutes(10)); await Manual(s, child.Id, Morning.AddMinutes(10), Morning.AddMinutes(30));
        var f = await FocusTests.Start(s, settings: new(600)); app.Clock.Now = Morning.AddMinutes(45); f = await Change(s, f, "pause"); app.Clock.Now = Morning.AddMinutes(55); f = await Change(s, f, "resume"); app.Clock.Now = Morning.AddMinutes(65); await Change(s, f, "finish");
        var report = await Report(s); var total = report.Totals; Assert.Equal(2700m, total.WorkSeconds); Assert.Equal(1800m, total.TaskWorkSeconds); Assert.Equal(900m, total.GeneralWorkSeconds); Assert.Equal(1800m, total.ManualWorkSeconds); Assert.Equal(3, total.SessionCount); Assert.Equal(4, total.SegmentCount);
        Assert.Equal(900m, total.Focus.ActiveSeconds); Assert.Equal(300m, total.Focus.OvertimeSeconds); Assert.Equal(1, total.Focus.ActiveCycleCount); Assert.Equal(1, total.Focus.FinishedCount); Assert.Equal(1, total.Focus.EffectiveTargetsReached); Assert.Equal(1, total.Focus.RecordedTargetsReached); Assert.Equal(900m, total.Focus.AverageActiveSeconds);
        var tasks = await TaskScenario.Read<ActualBreakdownPage>(await s.Client.GetAsync("/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15")); Assert.Equal(3, tasks.Total); Assert.Equal(600m, tasks.Items.Single(x => x.Id == parent.Id).WorkSeconds); Assert.Equal(1200m, tasks.Items.Single(x => x.Id == child.Id).WorkSeconds);
        var week = await Report(s, bucket: "Week"); Assert.Equal(new DateOnly(2026, 10, 12), Assert.Single(week.Buckets).BucketStart); Assert.Equal(total.WorkSeconds, week.Totals.WorkSeconds);
        var month = await Report(s, "2026-10-01", "2026-10-31", "Month"); Assert.Equal(2700m, Assert.Single(month.Buckets).Metrics.WorkSeconds);
    }
    [Fact]
    public async Task MidnightCorrectionKeepsMicrosecondsAndAuditNeverAddsActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var start = new DateTimeOffset(2026, 10, 14, 20, 30, 0, TimeSpan.Zero); var work = await Manual(s, task.Id, start, start.AddHours(1));
        var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items); var correctedEnd = start.AddMinutes(30).AddTicks(1234560);
        Assert.True((await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = start, endedAt = correctedEnd, isVoided = false, reason = "Düzeltme" })).IsSuccessStatusCode);
        var report = await Report(s, "2026-10-14", "2026-10-15"); Assert.Equal(1800.123456m, report.Totals.WorkSeconds); Assert.Equal(1800m, report.Buckets[0].Metrics.WorkSeconds); Assert.Equal(.123456m, report.Buckets[1].Metrics.WorkSeconds); Assert.Equal(1, report.Totals.SegmentCount);
    }
    [Theory] [InlineData("2026-03-29", 23)] [InlineData("2026-10-25", 25)]
    public async Task DstAndChangedCurrentZonePreserveSourceSessionDays(string text, int hours)
    {
        var date = DateOnly.Parse(text); var start = PlanTime.DayStart(date, "Europe/Berlin"); var end = PlanTime.DayStart(date.AddDays(1), "Europe/Berlin");
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = end.AddHours(1); var s = await TaskScenario.User(app); await Zone(s, "Europe/Berlin"); var task = await s.Root(); await Manual(s, task.Id, start, end); await Zone(s, "UTC");
        var report = await Report(s, text); Assert.Equal(hours * 3600m, report.Totals.WorkSeconds); Assert.Equal(new[] { "Europe/Berlin" }, report.SourceTimeZones); Assert.Equal("SourceSessionZone", report.TimeZonePolicy);
    }
    [Fact]
    public async Task HistoricalProjectCategoryAndTaskNamesComeFromWorkSnapshot()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root("Eski başlık");
        var category = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/categories", new { name = "Eski kategori" })); var project = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/projects", new { name = "Proje" }));
        var classification = await TaskScenario.Read<ClassificationView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/classification")); Assert.True((await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = classification.Version, expectedPlanningVersion = classification.PlanningVersion, categoryId = category.Id, projectId = project.Id, tagIds = Array.Empty<Guid>() })).IsSuccessStatusCode);
        await Manual(s, task.Id, Morning, Morning.AddHours(1)); Assert.True((await s.Client.PutAsJsonAsync($"/api/categories/{category.Id}", new { version = category.Version, name = "Yeni kategori" })).IsSuccessStatusCode);
        task = await s.Get(task.Id); await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Yeni başlık" }); await Manual(s, task.Id, Morning.AddHours(1), Morning.AddMinutes(65));
        var categories = await TaskScenario.Read<ActualBreakdownPage>(await s.Client.GetAsync("/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&dimension=Category")); Assert.Equal(2, categories.Total); Assert.Equal(3600m, categories.Items.Single(x => x.Label == "Eski kategori").WorkSeconds); Assert.Equal(300m, categories.Items.Single(x => x.Label == "Yeni kategori").WorkSeconds); Assert.All(categories.Items, x => Assert.Equal(category.Id, x.Id));
        var projects = await TaskScenario.Read<ActualBreakdownPage>(await s.Client.GetAsync("/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&dimension=Project")); Assert.Equal(project.Id, Assert.Single(projects.Items).Id); Assert.Equal(3900m, projects.TotalWorkSeconds);
    }
    [Fact]
    public async Task CrossMidnightFocusAttributesTargetAndOvertimeOnceAndUsesHistoricalCutoff()
    {
        var start = new DateTimeOffset(2026, 10, 14, 20, 50, 0, TimeSpan.Zero); await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = start; var s = await TaskScenario.User(app);
        var f = await FocusTests.Start(s, settings: new(900)); app.Clock.Now = start.AddMinutes(20); await Change(s, f, "finish");
        var before = await Report(s, "2026-10-14"); Assert.Equal(600m, before.Totals.Focus.ActiveSeconds); Assert.Equal(0m, before.Totals.Focus.OvertimeSeconds); Assert.Equal(0, before.Totals.Focus.EffectiveTargetsReached);
        var after = await Report(s); Assert.Equal(600m, after.Totals.Focus.ActiveSeconds); Assert.Equal(300m, after.Totals.Focus.OvertimeSeconds); Assert.Equal(0, after.Totals.Focus.StartedCount); Assert.Equal(1, after.Totals.Focus.EffectiveTargetsReached);
        var both = await Report(s, "2026-10-14", "2026-10-15"); Assert.Equal(1, both.Totals.Focus.ActiveCycleCount); Assert.Equal(1200m, both.Totals.Focus.ActiveSeconds); Assert.Equal(2, both.Buckets.Sum(x => x.Metrics.Focus.ActiveCycleCount));
    }
    [Fact]
    public async Task EmptyPeriodsAreNullForAverageAndOtherOwnerDataCannotBeRequested()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(2); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var task = await b.Root(); await Manual(b, task.Id, Morning, Morning.AddHours(1));
        var report = await Report(a); Assert.Equal(0m, report.Totals.WorkSeconds); Assert.Null(report.Totals.Focus.AverageActiveSeconds);
        var own = await TaskScenario.Read<ActualAnalyticsView>(await a.Client.GetAsync($"/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15&userId={b.UserId}")); Assert.Equal(0m, own.Totals.WorkSeconds);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.GetAsync("/api/analytics/actual?fromDate=2025-01-01&toDate=2026-10-15")).StatusCode); Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.GetAsync("/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/analytics/actual?fromDate=2026-10-15&toDate=2026-10-15")).StatusCode);
    }
    [Fact]
    public async Task FocusCorrectionSeparatesRecordedTargetFromEffectiveTargetAndOvertime()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var f = await FocusTests.Start(s, settings: new(60)); app.Clock.Now = Morning.AddMinutes(2); await Change(s, f, "finish");
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}")); var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items);
        var correction = await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = Morning, endedAt = Morning.AddSeconds(30), isVoided = false, reason = "Unutulan süre" }); Assert.True(correction.IsSuccessStatusCode, await correction.Content.ReadAsStringAsync());
        var report = await Report(s); Assert.Equal(30m, report.Totals.WorkSeconds); Assert.Equal(30m, report.Totals.Focus.ActiveSeconds); Assert.Equal(0m, report.Totals.Focus.OvertimeSeconds); Assert.Equal(0, report.Totals.Focus.EffectiveTargetsReached); Assert.Equal(1, report.Totals.Focus.RecordedTargetsReached);
    }
    [Fact]
    public async Task LegacyMissingSnapshotIsVisibleWithoutFillingItFromTodaysTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(1); var s = await TaskScenario.User(app); var task = await s.Root("Bugünkü başlık");
        await using var db = fixture.CreateContext(); var work = new Adhd.Domain.Work.WorkSession { Id = Guid.NewGuid(), UserId = s.UserId, TaskId = task.Id, Source = Adhd.Domain.Work.WorkSource.Manual, State = Adhd.Domain.Work.WorkState.Finished, StartedAt = Morning, EndedAt = Morning.AddMinutes(10), RecordedAt = app.Clock.Now };
        db.WorkSessions.Add(work); db.WorkSegments.Add(new() { Id = Guid.NewGuid(), UserId = s.UserId, SessionId = work.Id, StartedAt = Morning, EndedAt = work.EndedAt }); await db.SaveChangesAsync();
        var report = await Report(s); Assert.Equal(600m, report.Totals.MissingSnapshotSeconds);
        var breakdown = await TaskScenario.Read<ActualBreakdownPage>(await s.Client.GetAsync("/api/analytics/actual/breakdown?fromDate=2026-10-15&toDate=2026-10-15&dimension=Category")); var item = Assert.Single(breakdown.Items); Assert.False(item.SnapshotAvailable); Assert.Equal("Geçmiş bağlam bilinmiyor", item.Label);
    }
    [Fact]
    public async Task FinishingAfterLongBreakCountsFinishWithoutInventingActualInThatPeriod()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddDays(-3); var s = await TaskScenario.User(app); var f = await FocusTests.Start(s, settings: new(600, 60));
        app.Clock.Now = app.Clock.Now.AddMinutes(10); f = await Change(s, f, "break"); app.Clock.Now = Morning; await Change(s, f, "finish");
        var report = await Report(s); Assert.Equal(0m, report.Totals.WorkSeconds); Assert.Equal(0, report.Totals.Focus.ActiveCycleCount); Assert.Null(report.Totals.Focus.AverageActiveSeconds); Assert.Equal(1, report.Totals.Focus.FinishedCount);
    }
}
