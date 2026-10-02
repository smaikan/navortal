using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Collections;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class PlanAnalyticsTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static async Task<PlanAnalyticsView> Report(TaskScenario s, string from = "2026-10-15", string? to = null, int tolerance = 60)
    {
        var response = await s.Client.GetAsync($"/api/analytics/plans?fromDate={from}&toDate={to ?? from}&startToleranceSeconds={tolerance}"); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); return await TaskScenario.Read<PlanAnalyticsView>(response);
    }
    private static async Task<WorkView> Manual(TaskScenario s, Guid id, DateTimeOffset start, DateTimeOffset end)
    {
        var response = await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = id, startedAt = start, endedAt = end, reason = "Plan metriği" }); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); return await TaskScenario.Read<WorkView>(response);
    }
    [Fact]
    public async Task BaselineTenAndOneEightyMinuteTasksKeepDenominatorWhenUrgentThirtyFiveMinutesArriveLater()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 900);
        var a = await s.Root("A"); await s.Define(a.Id, true, 600); var b = await s.Root("B"); await s.Define(b.Id, true, 10800);
        var preview = await SchedulingHttpTests.Preview(s, a.Id, b.Id); Assert.True((await SchedulingHttpTests.Apply(s, preview.ProposalId)).IsSuccessStatusCode);
        var initial = await Day(s); var items = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{initial.CurrentRevisionId}/items")); var bBlock = items.Items.Single(x => x.Schedule.TaskId == b.Id).Schedule;
        var workStart = items.Items.Single(x => x.Schedule.TaskId == a.Id).Schedule.StartsAt; Assert.Equal(TimeSpan.FromMinutes(10), items.Items.Single(x => x.Schedule.TaskId == a.Id).Schedule.EndsAt - workStart);
        Assert.True((await Change(s, bBlock, start: workStart.AddMinutes(45), end: workStart.AddMinutes(225))).IsSuccessStatusCode);
        var c = await s.Root("Acil C"); await s.Define(c.Id, true, 2100); c = await s.Get(c.Id); await s.Client.PutAsJsonAsync($"/api/tasks/{c.Id}", new { version = c.Version, title = c.Title, priority = "Urgent" });
        var day = await Day(s); var add = await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = c.Id, kind = "Work", startsAt = workStart.AddMinutes(10), endsAt = workStart.AddMinutes(45), expectedPlanningVersion = day.PlanningVersion }); Assert.True(add.IsSuccessStatusCode, await add.Content.ReadAsStringAsync());
        app.Clock.Now = workStart.AddMinutes(50); await Manual(s, a.Id, workStart, workStart.AddMinutes(10)); await Manual(s, c.Id, workStart.AddMinutes(10), workStart.AddMinutes(45)); await s.State(a.Id, TaskAction.Complete); await s.State(c.Id, TaskAction.Complete);
        var report = await Report(s); Assert.Equal(2700m, report.ActualSeconds); Assert.Equal(2, report.Baseline.ComponentCount); Assert.Equal(1, report.Baseline.CompletedComponentCount); Assert.Equal(.5m, report.Baseline.CountCompletion); Assert.Equal(600m / 11400m, report.Baseline.DurationCompletion);
        Assert.Equal(3, report.Current.ComponentCount); Assert.Equal(2, report.Current.CompletedComponentCount); Assert.Equal(2m / 3m, report.Current.CountCompletion); Assert.Equal(.2m, report.Current.DurationCompletion);
        Assert.Equal(2100m, report.Baseline.UnplannedActualSeconds); Assert.Equal(0m, report.Current.UnplannedActualSeconds); Assert.Equal(2700m, report.Current.QuotaFulfilledSeconds); Assert.Equal(initial.BaselineRevisionId, report.Days[0].BaselineRevisionId); Assert.True(report.RevisionCount >= 3);
    }
    [Fact]
    public async Task OneHourOnTwelveHourProjectFulfillsDailyQuotaWithoutCompletingTaskAndUnknownEstimateHasCoverage()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); await s.Define(t.Id, true, 43200);
        await Create(s, t.Id, Morning, Morning.AddHours(1)); var unknown = await s.Root(); await Create(s, unknown.Id, Morning.AddHours(1), Morning.AddMinutes(75));
        app.Clock.Now = Morning.AddHours(2); await Manual(s, t.Id, Morning, Morning.AddHours(1)); var report = await Report(s);
        Assert.Equal(0m, report.Current.CountCompletion); Assert.Equal(0m, report.Current.DurationCompletion); Assert.Equal(1, report.Current.UnknownEstimateCount); Assert.Equal(.5m, report.Current.EstimateCoverage); Assert.Equal(43200m, report.Current.KnownEstimatedSeconds);
        Assert.Equal(3600m, report.Baseline.QuotaFulfilledSeconds); Assert.Equal(1m, report.Baseline.QuotaRatio); Assert.Equal(3600m / 4500m, report.Current.QuotaRatio); Assert.Equal(TaskState.Pending, (await s.Get(t.Id)).State);
    }
    [Fact]
    public async Task HistoricalCompletionUsesEventsAfterReopenAndContainerCannotInflateIndependentCount()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var parent = await s.Root(); await s.Define(parent.Id, false); var child = await s.Child(parent.Id); await s.Define(child.Id, true, 600); await Create(s, child.Id, Morning, Morning.AddMinutes(10));
        app.Clock.Now = Morning.AddMinutes(20); await s.State(child.Id, TaskAction.Complete); app.Clock.Now = Morning.AddDays(1); await s.State(child.Id, TaskAction.Reopen);
        var past = await Report(s); Assert.Equal(1, past.Baseline.ComponentCount); Assert.Equal(1, past.Baseline.CompletedComponentCount); Assert.Equal(1m, past.Baseline.CountCompletion); Assert.Equal(TaskState.Pending, (await s.Get(child.Id)).State);
        Assert.Equal(0, past.Baseline.Accuracy.SampleCount); Assert.Equal(1, past.Baseline.Accuracy.ExcludedWithoutRecordedWorkCount);
    }
    [Fact]
    public async Task PlannedStartDelayDistinguishesFixedAndFlexibleAndToleranceIsExplicit()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root();
        var first = await Create(s, a.Id, Morning, Morning.AddMinutes(10), isFixed: true); var second = await Create(s, b.Id, Morning.AddMinutes(20), Morning.AddMinutes(30));
        app.Clock.Now = Morning.AddMinutes(1); var response = await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = a.Id, scheduleId = first.Schedules[0].Id, scheduleVersion = first.Schedules[0].Version }); var work = await TaskScenario.Read<WorkView>(response); app.Clock.Now = Morning.AddMinutes(10); await WorkSessionTests.Change(s, work, "finish");
        app.Clock.Now = Morning.AddMinutes(22); response = await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = b.Id, scheduleId = second.Schedules[0].Id, scheduleVersion = second.Schedules[0].Version }); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        app.Clock.Now = Morning.AddMinutes(23); var report = await Report(s); Assert.Equal(1, report.Current.FixedStarts.OnTimeCount); Assert.Equal(60m, report.Current.FixedStarts.AverageSignedDelaySeconds); Assert.Equal(1, report.Current.FlexibleStarts.LateCount); Assert.Equal(120m, report.Current.FlexibleStarts.AverageLateSeconds);
        Assert.Equal(1, (await Report(s, tolerance: 0)).Current.FixedStarts.LateCount);
    }
    [Fact]
    public async Task RepeatedTaskAcrossDaysCountsOnceAndPerDayQuotaCannotDoubleCountItsActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 7200); await Create(s, task.Id, Morning, Morning.AddHours(1)); await Create(s, task.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1));
        app.Clock.Now = Morning.AddDays(1).AddHours(2); await Manual(s, task.Id, Morning, Morning.AddHours(1)); await Manual(s, task.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); await s.State(task.Id, TaskAction.Complete);
        var report = await Report(s, "2026-10-15", "2026-10-16"); Assert.Equal(1, report.Current.ComponentCount); Assert.Equal(7200m, report.Current.KnownEstimatedSeconds); Assert.Equal(7200m, report.Current.QuotaFulfilledSeconds); Assert.Equal(1m, report.Current.QuotaRatio); Assert.Equal(0m, report.Days[0].Current.CountCompletion); Assert.Equal(1m, report.Days[1].Current.CountCompletion);
    }
    [Fact]
    public async Task OptionalDeferReasonAndMissingReasonRemainDistinctAndReviewIsReadOnly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root();
        Assert.True((await s.Client.PostAsJsonAsync($"/api/tasks/{a.Id}/state", new { version = a.Version, action = "Defer", reason = "Toplantı uzadı" })).IsSuccessStatusCode); await s.State(b.Id, TaskAction.Defer);
        await using var db = fixture.CreateContext(); var before = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId); var events = await db.TaskEvents.CountAsync(x => x.UserId == s.UserId);
        var review = await TaskScenario.Read<PlanAnalyticsDay>(await s.Client.GetAsync("/api/analytics/days/2026-10-15/review")); Assert.Equal(2, review.DeferCount); Assert.Contains(review.DeferReasons, x => x.Reason == "Toplantı uzadı" && x.ReasonAvailable); Assert.Contains(review.DeferReasons, x => x.Reason is null && !x.ReasonAvailable);
        Assert.Null(review.Current.CountCompletion); Assert.Null(review.Current.DurationCompletion); Assert.Null(review.Current.QuotaRatio); Assert.Equal(before.PlanningVersion, (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion); Assert.Equal(events, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ComparableCategoryMedianNeedsThreeRecordedCompletedSamplesAndDoesNotMutateTarget()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var category = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/categories", new { name = "Yazı" })); var tasks = new List<TaskView>();
        for (var i = 0; i < 4; i++)
        {
            var task = await s.Root($"Örnek{i}"); var c = await TaskScenario.Read<ClassificationView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/classification")); Assert.True((await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/classification", new { version = c.Version, categoryId = category.Id, tagIds = Array.Empty<Guid>(), expectedPlanningVersion = c.PlanningVersion })).IsSuccessStatusCode); tasks.Add(await s.Get(task.Id));
        }
        await Manual(s, tasks[0].Id, Morning, Morning.AddMinutes(10)); await Manual(s, tasks[1].Id, Morning.AddMinutes(10), Morning.AddMinutes(30)); await Manual(s, tasks[2].Id, Morning.AddMinutes(30), Morning.AddMinutes(60)); for (var i = 0; i < 3; i++) await s.State(tasks[i].Id, TaskAction.Complete);
        await using var db = fixture.CreateContext(); var version = (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion; var target = await s.Get(tasks[3].Id);
        var response = await s.Client.GetAsync($"/api/analytics/estimate-suggestion?taskId={target.Id}&fromDate=2026-10-15&toDate=2026-10-15"); Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync()); var suggestion = await TaskScenario.Read<EstimateSuggestionView>(response);
        Assert.Equal("Category", suggestion.ComparisonContext); Assert.Equal(3, suggestion.SampleCount); Assert.Equal(1200m, suggestion.SuggestedSeconds); Assert.False(suggestion.Applied); Assert.Equal(target, await s.Get(target.Id)); Assert.Equal(version, (await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == s.UserId)).PlanningVersion);
        var foreign = await TaskScenario.User(app); Assert.Equal(HttpStatusCode.NotFound, (await foreign.Client.GetAsync($"/api/analytics/estimate-suggestion?taskId={target.Id}&fromDate=2026-10-15&toDate=2026-10-15")).StatusCode); Assert.Equal(0m, (await Report(foreign)).ActualSeconds);
    }
    [Fact]
    public async Task AcceptedOverlappingBlocksExposeConflictButSameTaskQuotaUsesUnion()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 1800);
        await Create(s, task.Id, Morning, Morning.AddMinutes(20)); await Create(s, task.Id, Morning.AddMinutes(10), Morning.AddMinutes(30), accept: true); app.Clock.Now = Morning.AddHours(1); await Manual(s, task.Id, Morning, Morning.AddMinutes(30));
        var report = await Report(s); Assert.Equal(2400m, report.Current.PlannedWorkSeconds); Assert.Equal(600m, report.Current.ConflictingPlannedSeconds); Assert.Equal(1800m, report.Current.QuotaSeconds); Assert.Equal(1800m, report.Current.QuotaFulfilledSeconds); Assert.Equal(1m, report.Current.QuotaRatio); Assert.Equal(1, report.Current.ComponentCount);
    }
    [Fact]
    public async Task NoComparableHistoryIsExplicitAndSkippedWorkIsNotCompleted()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 600); await Create(s, task.Id, Morning.AddHours(1), Morning.AddMinutes(70)); await s.State(task.Id, TaskAction.Skip);
        var report = await Report(s); Assert.Equal(0, report.Baseline.CompletedComponentCount); Assert.Equal(0m, report.Baseline.CountCompletion); Assert.Null(report.Current.CountCompletion);
        var suggestion = await TaskScenario.Read<EstimateSuggestionView>(await s.Client.GetAsync($"/api/analytics/estimate-suggestion?taskId={task.Id}&fromDate=2026-10-15&toDate=2026-10-15")); Assert.Equal("no_comparable_context", suggestion.UnavailableReason); Assert.Null(suggestion.SuggestedSeconds); Assert.False(suggestion.Applied);
    }
}
