using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class WorkCorrectionTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static Task<HttpResponseMessage> Manual(TaskScenario s, Guid id, DateTimeOffset start, DateTimeOffset end, string reason = "Unutulan çalışma", string? key = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/work-sessions/manual") { Content = JsonContent.Create(new { taskId = id, startedAt = start, endedAt = end, reason }) };
        request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return s.Client.SendAsync(request);
    }
    private static async Task<SegmentView> Segment(TaskScenario s, WorkView work) => Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items);
    private static Task<HttpResponseMessage> Correct(TaskScenario s, WorkView work, SegmentView segment, DateTimeOffset start, DateTimeOffset? end, bool isVoided = false, string reason = "Sayaç açık unutuldu") =>
        s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = start, endedAt = end, isVoided, reason });
    [Fact]
    public async Task TwoCorrectionsPreserveOriginalAndPreviousValuesWithoutCountingAuditAsWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(5); var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 7200);
        var response = await Manual(s, task.Id, Morning, Morning.AddHours(1)); Assert.Equal(HttpStatusCode.Created, response.StatusCode); var work = await TaskScenario.Read<WorkView>(response);
        Assert.Equal(WorkSource.Manual, work.Source); Assert.Equal(app.Clock.Now, work.RecordedAt); Assert.Equal(app.Clock.Now, work.TaskAtStart!.CapturedAt); Assert.Equal(TaskState.Pending, (await s.Get(task.Id)).State);
        work = await TaskScenario.Read<WorkView>(await Correct(s, work, await Segment(s, work), Morning, Morning.AddMinutes(45), reason: "İlk düzeltme"));
        work = await TaskScenario.Read<WorkView>(await Correct(s, work, await Segment(s, work), Morning, Morning.AddMinutes(30), reason: "İkinci düzeltme"));
        Assert.Equal(1800m, work.ActiveSeconds); var audit = await TaskScenario.Read<CorrectionPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections")); Assert.Equal(3, audit.Total);
        Assert.Null(audit.Items[0].PreviousValues); Assert.Equal("ManualAdded", audit.Items[0].Kind); Assert.Equal(Morning.AddHours(1), audit.Items[0].NewValues.EndedAt);
        Assert.Equal(Morning.AddHours(1), audit.Items[1].PreviousValues!.EndedAt); Assert.Equal(Morning.AddMinutes(45), audit.Items[1].NewValues.EndedAt);
        Assert.Equal(Morning.AddMinutes(45), audit.Items[2].PreviousValues!.EndedAt); Assert.Equal("İkinci düzeltme", audit.Items[2].Reason);
        var time = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/time")); Assert.Equal(1800m, time.SubtreeActualSeconds); Assert.Equal(5400m, time.RemainingSeconds);
    }
    [Fact]
    public async Task ForgottenRunningTimerCanBeClosedInPastWithoutCompletingTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var work = await WorkSessionTests.Started(s, task.Id);
        app.Clock.Now = Morning.AddHours(8); var originalSnapshot = work.TaskAtStart;
        var corrected = await Correct(s, work, await Segment(s, work), Morning, Morning.AddHours(1)); Assert.Equal(HttpStatusCode.OK, corrected.StatusCode); work = await TaskScenario.Read<WorkView>(corrected);
        Assert.Equal(WorkState.Finished, work.State); Assert.Equal(3600m, work.ActiveSeconds); Assert.Equal(Morning.AddHours(1), work.EndedAt); Assert.Equal(TaskState.Paused, (await s.Get(task.Id)).State);
        Assert.Equal(originalSnapshot!.CapturedAt, work.TaskAtStart!.CapturedAt); Assert.Null((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
        var audit = Assert.Single((await TaskScenario.Read<CorrectionPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections"))).Items); Assert.Null(audit.PreviousValues!.EndedAt); Assert.Equal(WorkState.Running, audit.PreviousSession!.State);
        _ = await WorkSessionTests.Started(s, task.Id);
    }
    [Fact]
    public async Task TouchingIntervalsPassButManualAndCorrectionOverlapsFailWithoutSideEffects()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(4); var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root();
        var work = await TaskScenario.Read<WorkView>(await Manual(s, a.Id, Morning, Morning.AddHours(1)));
        Assert.Equal(HttpStatusCode.Created, (await Manual(s, b.Id, Morning.AddHours(1), Morning.AddMinutes(90))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Manual(s, b.Id, Morning.AddMinutes(59), Morning.AddMinutes(90))).StatusCode);
        var segment = await Segment(s, work); Assert.Equal(HttpStatusCode.Conflict, (await Correct(s, work, segment, Morning, Morning.AddMinutes(61))).StatusCode);
        var loaded = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(work.Version, loaded.Version); Assert.Equal(3600m, loaded.ActiveSeconds);
        Assert.Equal(1, (await TaskScenario.Read<CorrectionPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections"))).Total);
        var active = await WorkSessionTests.Started(s, b.Id);
        app.Clock.Now = app.Clock.Now.AddMinutes(1);
        Assert.Equal(HttpStatusCode.Conflict, (await Manual(s, a.Id, active.StartedAt.AddSeconds(1), app.Clock.Now)).StatusCode);
    }
    [Fact]
    public async Task VoidAndRestoreKeepAuditAndCannotReopenClosedSegment()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root();
        var work = await TaskScenario.Read<WorkView>(await Manual(s, task.Id, Morning, Morning.AddHours(1))); var segment = await Segment(s, work);
        work = await TaskScenario.Read<WorkView>(await Correct(s, work, segment, segment.StartedAt, segment.EndedAt, true)); Assert.Equal(0m, work.ActiveSeconds);
        segment = await Segment(s, work); Assert.Equal(HttpStatusCode.Conflict, (await Correct(s, work, segment, Morning, null)).StatusCode);
        work = await TaskScenario.Read<WorkView>(await Correct(s, work, segment, Morning, Morning.AddMinutes(20))); Assert.Equal(1200m, work.ActiveSeconds);
        Assert.Equal(3, (await TaskScenario.Read<CorrectionPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections"))).Total);
    }
    [Fact]
    public async Task ParallelCorrectionsHaveOneWinnerAndStaleSegmentCannotBeOverwritten()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root(); var work = await TaskScenario.Read<WorkView>(await Manual(s, task.Id, Morning, Morning.AddHours(1))); var segment = await Segment(s, work);
        var race = await Task.WhenAll(Correct(s, work, segment, Morning, Morning.AddMinutes(10)), Correct(s, work, segment, Morning, Morning.AddMinutes(20)));
        Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        var current = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(HttpStatusCode.Conflict, (await Correct(s, current, segment, Morning, Morning.AddMinutes(30))).StatusCode);
        Assert.Equal(2, (await TaskScenario.Read<CorrectionPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections"))).Total);
    }
    [Fact]
    public async Task ManualRepeatIsIdempotentAndFutureInvalidOrUnexplainedRangesAreRejected()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root(); var key = Guid.NewGuid().ToString();
        var race = await Task.WhenAll(Manual(s, task.Id, Morning, Morning.AddHours(1), key: key), Manual(s, task.Id, Morning, Morning.AddHours(1), key: key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
        Assert.Equal((await TaskScenario.Read<WorkView>(race[0])).Id, (await TaskScenario.Read<WorkView>(race[1])).Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Manual(s, task.Id, Morning, Morning.AddMinutes(30), key: key)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Manual(s, task.Id, Morning, app.Clock.Now.AddMinutes(1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Manual(s, task.Id, Morning, Morning)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Manual(s, task.Id, Morning, Morning.AddMinutes(2), "   ")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/work-sessions/manual", new { taskId = task.Id, startedAt = Morning, endedAt = Morning.AddHours(1), reason = "Forgot" })).StatusCode);
    }
    [Fact]
    public async Task CompletedArchivedHistoryCanBeCorrectedWithoutReopeningTaskAndOffsetIsNormalized()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root(); await s.State(task.Id, TaskAction.Complete); task = await s.Get(task.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = task.Version })).StatusCode);
        var local = Morning.ToOffset(TimeSpan.FromHours(3)).AddTicks(7); var work = await TaskScenario.Read<WorkView>(await Manual(s, task.Id, local, local.AddMinutes(20)));
        Assert.Equal(TimeSpan.Zero, work.StartedAt.Offset); Assert.Equal(Morning, work.StartedAt); Assert.Equal(1200m, work.ActiveSeconds);
        work = await TaskScenario.Read<WorkView>(await Correct(s, work, await Segment(s, work), Morning, Morning.AddMinutes(10))); Assert.Equal(600m, work.ActiveSeconds); Assert.Equal(TaskState.Completed, (await s.Get(task.Id)).State);
        var time = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/time")); Assert.Equal(600m, time.SubtreeActualSeconds); Assert.Equal(0m, time.RemainingSeconds);
    }
    [Fact]
    public async Task ForeignSessionSegmentAndTaskAreRejected()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var task = await a.Root(); var work = await TaskScenario.Read<WorkView>(await Manual(a, task.Id, Morning, Morning.AddHours(1))); var segment = await Segment(a, work);
        Assert.Equal(HttpStatusCode.NotFound, (await Manual(b, task.Id, Morning, Morning.AddMinutes(20))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Correct(b, work, segment, Morning, Morning.AddMinutes(20))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/work-sessions/{work.Id}/corrections")).StatusCode);
        var own = await b.Root(); var ownWork = await TaskScenario.Read<WorkView>(await Manual(b, own.Id, Morning, Morning.AddHours(1)));
        Assert.Equal(HttpStatusCode.NotFound, (await Correct(b, ownWork, segment, Morning, Morning.AddMinutes(20))).StatusCode);
    }
    [Fact]
    public async Task JournalFailureRollsBackEffectiveSegmentAndTaskPlanningVersions()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(3); var s = await TaskScenario.User(app); var task = await s.Root(); var work = await TaskScenario.Read<WorkView>(await Manual(s, task.Id, Morning, Morning.AddHours(1))); var segment = await Segment(s, work); task = await s.Get(task.Id);
        await using var db = fixture.CreateContext(); var planning = (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion;
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_correction_test() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW."Kind" = 'Adjusted' THEN RAISE EXCEPTION 'test correction journal failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_correction_test BEFORE INSERT ON work_session_corrections FOR EACH ROW EXECUTE FUNCTION reject_correction_test();
            """);
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Correct(s, work, segment, Morning, Morning.AddMinutes(10))).StatusCode);
            var loaded = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(work.Version, loaded.Version); Assert.Equal(3600m, loaded.ActiveSeconds); Assert.Equal(task.Version, (await s.Get(task.Id)).Version);
            db.ChangeTracker.Clear(); Assert.Equal(planning, (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion); Assert.Equal(1, await db.WorkCorrections.CountAsync(x => x.UserId == s.UserId));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_correction_test ON work_session_corrections; DROP FUNCTION reject_correction_test();"); }
    }
}
