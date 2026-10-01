using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Calendar;
using Adhd.Application.Collections;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class CalendarTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static async Task<CalendarDayView> Detail(TaskScenario s, string date = "2026-10-15", string query = "")
    {
        var r = await s.Client.GetAsync($"/api/calendar/days/{date}{query}"); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<CalendarDayView>(r);
    }
    private static async Task<WorkView> Manual(TaskScenario s, Guid task, DateTimeOffset start, DateTimeOffset end)
    {
        var r = await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = task, startedAt = start, endedAt = end, reason = "Takvim geçmişi" });
        Assert.True(r.StatusCode == HttpStatusCode.Created, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<WorkView>(r);
    }
    private static async Task Zone(TaskScenario s, string zone)
    {
        var p = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { version = p.Version, values = p.Values with { TimeZoneId = zone } })).StatusCode);
    }
    [Fact]
    public async Task HistoricalDayKeepsSnapshotPathTitleAndCompletedStateAfterRenameMoveAndReopen()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var parent = await s.Root("Eski proje"); var task = await s.Child(parent.Id, "Eski başlık"); await s.Define(task.Id, true, 3600);
        var created = await Create(s, task.Id, Morning, Morning.AddHours(1)); var baseline = (await Day(s)).BaselineRevisionId;
        var work = await WorkSessionTests.Started(s, task.Id); app.Clock.Now = Morning.AddMinutes(30); await s.State(task.Id, TaskAction.Complete);
        var before = await Detail(s); Assert.Equal(1800m, before.Summary.ActualSeconds); Assert.Equal(3600m, before.Summary.BaselineWorkSeconds); Assert.Equal(1800m, before.Summary.PlannedWorkSeconds);
        app.Clock.Now = Morning.AddDays(14); await s.State(task.Id, TaskAction.Reopen); task = await s.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Bugünkü başlık" })).StatusCode);
        task = await s.Get(task.Id); Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/move", new { version = task.Version, parentTaskId = (Guid?)null })).StatusCode);
        var day = await Detail(s); var planned = Assert.Single(day.Plan.Items); var actual = Assert.Single(day.Actual.Items); var completion = Assert.Single(day.Completions.Items, x => x.TaskId == task.Id);
        Assert.Equal("Eski başlık", planned.Schedule.TaskSnapshot!.Task.Title); Assert.Equal("Eski proje", Assert.Single(planned.Schedule.TaskSnapshot.Task.Ancestors).Name);
        Assert.Equal("Eski başlık", actual.TaskAtStart!.Title); Assert.Equal(work.Id, actual.SessionId); Assert.Equal(TaskState.Completed, actual.TaskAtDayEnd!.State); Assert.Equal(TaskState.Completed, planned.TaskAtDayEnd!.State);
        Assert.Equal("Eski başlık", completion.Title); Assert.Equal(parent.Id, completion.ParentTaskId); Assert.Equal(2, day.Summary.CompletedTaskCount);
        var initial = await Detail(s, query: $"?revisionId={baseline}"); Assert.Equal(3600d, (Assert.Single(initial.Plan.Items).Schedule.EndsAt - Morning).TotalSeconds); Assert.Equal(created.RevisionIds[0], initial.Plan.RevisionId);
        Assert.Equal(before.Summary.ActualSeconds, day.Summary.ActualSeconds); Assert.Equal(TaskState.Pending, (await s.Get(task.Id)).State);
    }
    [Fact]
    public async Task MidnightActualIsThirtyPlusThirtyWithSameSessionAndNoFakePlan()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddDays(1); var s = await TaskScenario.User(app); var root = await s.Root(); var t = await s.Child(root.Id);
        var start = DateTimeOffset.Parse("2026-10-15T23:30:00+03:00"); var work = await Manual(s, t.Id, start, start.AddHours(1));
        var a = await Detail(s); var b = await Detail(s, "2026-10-16"); Assert.Equal(1800m, a.Summary.ActualSeconds); Assert.Equal(1800m, b.Summary.ActualSeconds);
        Assert.Equal(work.Id, Assert.Single(a.Actual.Items).SessionId); Assert.Equal(work.Id, Assert.Single(b.Actual.Items).SessionId); Assert.Equal(1800m, a.Actual.Items[0].ActiveSeconds); Assert.Equal(1800m, b.Actual.Items[0].ActiveSeconds);
        Assert.Equal(start.ToUniversalTime(), b.Actual.Items[0].SourceStartedAt); Assert.Null(a.Summary.DailyPlanId); Assert.Empty(a.Plan.Items); Assert.False(a.Actual.Items[0].TaskAtDayEnd!.Available);
        var range = await TaskScenario.Read<CalendarRangeView>(await s.Client.GetAsync("/api/calendar?fromDate=2026-10-15&toDate=2026-10-16")); Assert.Equal(3600m, range.Days.Sum(x => x.ActualSeconds));
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId));
    }
    [Theory] [InlineData("2026-03-29", 23)] [InlineData("2026-10-25", 25)]
    public async Task DstDayCountsRealInstantsRatherThanDisplayedHourLabels(string dateText, int hours)
    {
        var date = DateOnly.Parse(dateText); var start = PlanTime.DayStart(date, "Europe/Berlin"); var end = PlanTime.DayStart(date.AddDays(1), "Europe/Berlin");
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = end.AddHours(1); var s = await TaskScenario.User(app); await Zone(s, "Europe/Berlin"); var t = await s.Root(); await Manual(s, t.Id, start, end);
        var day = await Detail(s, dateText); Assert.Equal(hours * 3600m, day.Summary.ActualSeconds); Assert.Equal(hours * 3600m, Assert.Single(day.Actual.Items).ActiveSeconds);
    }
    [Fact]
    public async Task PreferenceZoneChangeDoesNotRedateWorkCompletionOrFrozenPlan()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = DateTimeOffset.Parse("2026-10-15T23:30:00+03:00"); var s = await TaskScenario.User(app); var t = await s.Root();
        await Create(s, t.Id, app.Clock.Now, app.Clock.Now.AddMinutes(10)); await WorkSessionTests.Started(s, t.Id); app.Clock.Now = app.Clock.Now.AddMinutes(10); await s.State(t.Id, TaskAction.Complete);
        await Zone(s, "America/New_York"); app.Clock.Now = Morning.AddDays(1); var d = await Detail(s); Assert.Equal("Europe/Istanbul", d.Summary.TimeZoneId); Assert.Equal(600m, d.Summary.ActualSeconds); Assert.Equal(1, d.Summary.CompletedTaskCount);
        Assert.Equal("Europe/Istanbul", Assert.Single(d.Completions.Items).TimeZoneId); Assert.Equal("Europe/Istanbul", Assert.Single(d.Actual.Items).TimeZoneId);
        await using var db = fixture.CreateContext(); Assert.All(await db.TaskEvents.Where(x => x.UserId == s.UserId).ToArrayAsync(), x => Assert.Equal("Europe/Istanbul", x.TimeZoneId));
    }
    [Fact]
    public async Task LivePausedAndCorrectedActualKeepsMicrosecondsAndDoesNotChangeBaseline()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); await Create(s, t.Id, Morning, Morning.AddHours(1));
        var w = await WorkSessionTests.Started(s, t.Id); app.Clock.Now = Morning.AddSeconds(1).AddTicks(10); var live = await Detail(s); Assert.Equal(1.000001m, live.Summary.ActualSeconds); Assert.True(live.Summary.HasOpenWork);
        w = await WorkSessionTests.Change(s, w, "pause"); app.Clock.Now = Morning.AddHours(2); var paused = await Detail(s); Assert.Equal(1.000001m, paused.Summary.ActualSeconds); Assert.False(paused.Summary.HasOpenWork);
        var seg = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{w.Id}/segments"))).Items);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{w.Id}/segments/{seg.Id}/corrections", new { version = w.Version, segmentVersion = seg.Version, startedAt = seg.StartedAt, endedAt = seg.EndedAt, isVoided = true, reason = "Yanlış kayıt" })).StatusCode);
        var corrected = await Detail(s); Assert.Equal(0m, corrected.Summary.ActualSeconds); Assert.Empty(corrected.Actual.Items); Assert.Equal(3600m, corrected.Summary.BaselineWorkSeconds);
    }
    [Fact]
    public async Task BoundedPagesAndForeignRevisionsAreIsolatedAndCompletionEventsRemainDistinct()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var a = await s.Root(); var b = await s.Root(); await Create(s, a.Id, Morning, Morning.AddMinutes(10)); await Create(s, b.Id, Morning.AddMinutes(10), Morning.AddMinutes(20));
        app.Clock.Now = Morning.AddHours(2); await Manual(s, a.Id, Morning, Morning.AddMinutes(10)); await Manual(s, b.Id, Morning.AddMinutes(10), Morning.AddMinutes(20));
        await s.State(a.Id, TaskAction.Complete); await s.State(a.Id, TaskAction.Reopen); await s.State(a.Id, TaskAction.Complete);
        var d = await Detail(s, query: "?planOffset=1&planLimit=1&actualOffset=1&actualLimit=1&completionOffset=1&completionLimit=1"); Assert.Equal(2, d.Plan.Total); Assert.Single(d.Plan.Items); Assert.Equal(2, d.Actual.Total); Assert.Single(d.Actual.Items); Assert.Equal(2, d.Completions.Total); Assert.Single(d.Completions.Items); Assert.Equal(1, d.Summary.CompletedTaskCount);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/calendar/days/2026-10-15?revisionId={d.Plan.RevisionId}")).StatusCode);
        Assert.Empty((await Detail(other)).Actual.Items); Assert.Empty((await Detail(other)).Completions.Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/calendar?fromDate=2026-01-01&toDate=2026-12-31")).StatusCode); Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/calendar")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/calendar/days/2026-10-15?actualLimit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/calendar/days/2026-10-15")).StatusCode);
        var range = await TaskScenario.Read<CalendarRangeView>(await s.Client.GetAsync("/api/calendar?fromDate=2026-10-01&toDate=2026-11-11")); Assert.Equal(42, range.Days.Length); Assert.Equal(1200m, range.Days.Sum(x => x.ActualSeconds));
    }
    [Fact]
    public async Task CarryPreviewsRemainingSameTaskAndApplyPreservesSourceActualAndHistory()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 5400); var old = await Create(s, t.Id, Morning, Morning.AddHours(1));
        app.Clock.Now = Morning.AddHours(1); var work = await Manual(s, t.Id, Morning, Morning.AddMinutes(30)); app.Clock.Now = Morning.AddDays(1);
        var body = new { fromDate = "2026-10-16", toDate = "2026-10-16", taskIds = new[] { t.Id }, expectedPlanningVersion = (await Day(s)).PlanningVersion }; var key = Guid.NewGuid().ToString();
        var r = await Send(s, HttpMethod.Post, "/api/calendar/days/2026-10-15/carry", body, key); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var p = await TaskScenario.Read<DistributionPreviewView>(r); Assert.Null(p.Applied); Assert.Equal(3600m, p.Days.SelectMany(x => x.Blocks).Where(x => x.TaskId == t.Id).Sum(x => (x.EndsAt - x.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond));
        Assert.Equal(p.ProposalId, (await TaskScenario.Read<DistributionPreviewView>(await Send(s, HttpMethod.Post, "/api/calendar/days/2026-10-15/carry", body, key))).ProposalId);
        Assert.Equal(HttpStatusCode.OK, (await DistributionTests.Apply(s, p.ProposalId)).StatusCode); var source = await Detail(s); Assert.Equal(old.RevisionIds[0], source.Plan.RevisionId); Assert.Equal(work.Id, Assert.Single(source.Actual.Items).SessionId); Assert.Equal(1800m, source.Summary.ActualSeconds);
        var target = await Detail(s, "2026-10-16"); Assert.Equal(t.Id, Assert.Single(target.Plan.Items).Schedule.TaskId); Assert.Empty(target.Actual.Items);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.Tasks.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task PoolCancelsOnlyFutureReservationsAtomicallyAndRequiresActiveAndProtectedIntent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var pool = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "Bekleyen" }));
        await Create(s, t.Id, Morning, Morning.AddHours(1)); var future = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1), isFixed: true);
        var work = await WorkSessionTests.Started(s, t.Id); app.Clock.Now = Morning.AddMinutes(20);
        async Task<HttpResponseMessage> Pool(bool protect = false, string? key = null) => await Send(s, HttpMethod.Post, $"/api/calendar/days/2026-10-15/tasks/{t.Id}/pool", new { version = (await s.Get(t.Id)).Version, expectedPlanningVersion = (await Day(s)).PlanningVersion, poolId = pool.Id, allowProtectedChange = protect }, key);
        Assert.Equal(HttpStatusCode.Conflict, (await Pool(true)).StatusCode); await WorkSessionTests.Change(s, work, "pause"); Assert.Equal(HttpStatusCode.Conflict, (await Pool()).StatusCode);
        var before = await Day(s); var key = Guid.NewGuid().ToString(); var body = new { version = (await s.Get(t.Id)).Version, expectedPlanningVersion = before.PlanningVersion, poolId = pool.Id, allowProtectedChange = true };
        var path = $"/api/calendar/days/2026-10-15/tasks/{t.Id}/pool"; var r = await Send(s, HttpMethod.Post, path, body, key); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<PlanMutation>(r); Assert.Equal(2, effect.RevisionIds.Length);
        Assert.Equal(effect.ChangeSetId, (await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, path, body, key))).ChangeSetId); Assert.Equal(pool.Id, (await s.Get(t.Id)).PoolId);
        var day = await Detail(s); Assert.Equal(1200m, day.Summary.ActualSeconds); Assert.Equal(1200m, day.Summary.PlannedWorkSeconds); Assert.Equal(3600m, day.Summary.BaselineWorkSeconds); Assert.Empty((await Detail(s, "2026-10-16")).Plan.Items);
        var old = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{future.RevisionIds[0]}/items")); Assert.Single(old.Items);
    }
    [Fact]
    public async Task PoolSnapshotFailureRollsBackClassificationPlanEventAndIdempotencyTogether()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root();
        var pool = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "Bekle" })); await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1));
        var before = await Day(s, new(2026, 10, 16)); var version = (await s.Get(t.Id)).Version; var key = Guid.NewGuid().ToString(); var body = new { version, expectedPlanningVersion = before.PlanningVersion, poolId = pool.Id }; var path = $"/api/calendar/days/2026-10-15/tasks/{t.Id}/pool";
        await using var db = fixture.CreateContext(); var eventCount = await db.TaskEvents.CountAsync(x => x.UserId == s.UserId);
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_pool_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Trigger\"='DayEnd' THEN RAISE EXCEPTION 'test pool revision failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_pool_test BEFORE INSERT ON plan_revisions FOR EACH ROW EXECUTE FUNCTION reject_pool_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s, HttpMethod.Post, path, body, key)).StatusCode);
            Assert.Null((await s.Get(t.Id)).PoolId); Assert.Equal(version, (await s.Get(t.Id)).Version); Assert.Equal(before.CurrentRevisionId, (await Day(s, new(2026, 10, 16))).CurrentRevisionId); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion);
            Assert.Equal(eventCount, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId)); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_pool_test ON plan_revisions; DROP FUNCTION reject_pool_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await Send(s, HttpMethod.Post, path, body, key)).StatusCode);
    }
    [Fact]
    public async Task CarryAutoAndInvalidRequestsHaveExplicitTargetsAndNoForeignTaskAccess()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto"); var t = await s.Root(); await s.Define(t.Id, true, 1800);
        var body = new { fromDate = "2026-10-16", toDate = "2026-10-16", taskIds = new[] { t.Id } }; var path = "/api/calendar/days/2026-10-15/carry";
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync(path, body)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/calendar/days/2026-10-16/carry", body)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(other, HttpMethod.Post, path, body)).StatusCode);
        var key = Guid.NewGuid().ToString(); var race = await Task.WhenAll(Send(s, HttpMethod.Post, path, body, key), Send(s, HttpMethod.Post, path, body, key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        var a = await TaskScenario.Read<DistributionPreviewView>(race[0]); var b = await TaskScenario.Read<DistributionPreviewView>(race[1]); Assert.Equal("Applied", a.Status); Assert.Equal(a.Applied!.ChangeSetId, b.Applied!.ChangeSetId); Assert.Single(a.Applied.RevisionIds);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, path, new { fromDate = "2026-10-17", toDate = "2026-10-17", taskIds = new[] { t.Id } }, key)).StatusCode);
        var foreignPool = await TaskScenario.Read<NamedResourceView>(await other.Client.PostAsJsonAsync("/api/pools", new { name = "Yabancı" }));
        Assert.Equal(HttpStatusCode.NotFound, (await Send(s, HttpMethod.Post, $"/api/calendar/days/2026-10-15/tasks/{t.Id}/pool", new { version = (await s.Get(t.Id)).Version, expectedPlanningVersion = (await Day(s)).PlanningVersion, poolId = foreignPool.Id })).StatusCode);
    }
}
