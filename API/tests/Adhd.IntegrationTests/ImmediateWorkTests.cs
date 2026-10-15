using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class ImmediateWorkTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static Task<HttpResponseMessage> StartNow(TaskScenario s, Guid task, long version, WorkView? active = null, string? key = null) =>
        Send(s, HttpMethod.Post, "/api/work-sessions/start-now", new { taskId = task, expectedPlanningVersion = version, expectedSessionId = active?.Id, expectedSessionVersion = active?.Version }, key);
    [Theory] [InlineData("Preview", true)] [InlineData("Auto", true)] [InlineData("Preview", false)]
    public async Task NineTwentyFixturePreservesActualAndFixedMeeting(string mode, bool canSplit)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, mode);
        var react = await s.Root("React"); await s.Define(react.Id, true, 3600); var backend = await s.Root("Backend"); await s.Define(backend.Id, true, 3600); var urgent = await s.Root("Acil"); await s.Define(urgent.Id, true, 1800);
        if (!canSplit) { backend = await s.Get(backend.Id); Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{backend.Id}", new { backend.Version, title = backend.Title, canSplit = false })).StatusCode); }
        var original = await Create(s, react.Id, Morning, Morning.AddHours(1)); await Create(s, backend.Id, Morning.AddHours(1), Morning.AddHours(2)); var meeting = Assert.Single((await Create(s, null, Morning.AddHours(2), Morning.AddHours(2.5), "Break", true)).Schedules);
        var first = await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = react.Id, scheduleId = original.Schedules[0].Id, scheduleVersion = original.Schedules[0].Version }); Assert.Equal(HttpStatusCode.Created, first.StatusCode); var old = await TaskScenario.Read<WorkView>(first);
        app.Clock.Now = Morning.AddMinutes(20); var before = await Day(s); var response = await StartNow(s, urgent.Id, before.PlanningVersion, old); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync()); var result = await TaskScenario.Read<ImmediateWorkResult>(response); var p = result.Plan!;
        Assert.Equal(app.Clock.Now, result.Work.Session.StartedAt); Assert.Equal(1200m, result.Work.PausedSession!.ActiveSeconds); Assert.Equal(WorkState.Paused, result.Work.PausedSession.State); Assert.Equal(old.StartedRevisionItemId, result.Work.PausedSession.StartedRevisionItemId);
        Assert.False(p.HasConstraintConflicts); Assert.Equal(mode == "Auto" ? "Applied" : "Preview", result.PlanningStatus);
        var emergency = Assert.Single(p.Blocks, x => x.TaskId == urgent.Id); Assert.Equal(Morning.AddMinutes(20), emergency.StartsAt); Assert.Equal(Morning.AddMinutes(50), emergency.EndsAt);
        var remainingReact = Assert.Single(p.Blocks, x => x.TaskId == react.Id && x.StartsAt >= app.Clock.Now); Assert.Equal(Morning.AddMinutes(50), remainingReact.StartsAt); Assert.Equal(Morning.AddMinutes(90), remainingReact.EndsAt);
        var fixedResult = Assert.Single(p.Blocks, x => x.ExistingScheduleId == meeting.Id); Assert.Equal(meeting.StartsAt, fixedResult.StartsAt); Assert.Equal(meeting.EndsAt, fixedResult.EndsAt);
        var backendPieces = p.Blocks.Where(x => x.TaskId == backend.Id).OrderBy(x => x.StartsAt).ToArray();
        if (canSplit)
        {
            Assert.Equal(2, backendPieces.Length); Assert.Equal(Morning.AddMinutes(90), backendPieces[0].StartsAt); Assert.Equal(Morning.AddHours(2), backendPieces[0].EndsAt); Assert.Equal(Morning.AddHours(2.5), backendPieces[1].StartsAt); Assert.Equal(Morning.AddHours(3), backendPieces[1].EndsAt); Assert.Empty(p.Unplaced);
        }
        else { Assert.Empty(backendPieces); Assert.Equal(3600m, Assert.Single(p.Unplaced, x => x.TaskId == backend.Id).RemainingSeconds); }
        if (mode == "Preview")
        {
            Assert.Equal(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId); // Önizleme reddedilse de gerçek çalışma kaydı kalır
            Assert.Equal(result.Work.Session.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
        }
        else Assert.NotEqual(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId);
        var history = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{original.RevisionIds[0]}/items")); Assert.Equal(Morning.AddHours(1), Assert.Single(history.Items).Schedule.EndsAt);
        var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{old.Id}/segments"))).Items); Assert.Equal(app.Clock.Now, segment.EndedAt);
        Assert.Equal(1200m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{react.Id}/time"))).DirectActualSeconds);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.WorkSegments.CountAsync(x => x.UserId == s.UserId && x.EndedAt == null));
    }
    [Fact]
    public async Task SameKeyReplayAndOldTabCannotInterruptNewSession()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto"); var a = await s.Root(); await s.Define(a.Id, true, 3600); var b = await s.Root(); await s.Define(b.Id, true, 1800); var c = await s.Root();
        var old = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); var version = (await Day(s)).PlanningVersion; var key = Guid.NewGuid().ToString();
        var races = await Task.WhenAll(StartNow(s, b.Id, version, old, key), StartNow(s, b.Id, version, old, key)); Assert.All(races, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); var first = await TaskScenario.Read<ImmediateWorkResult>(races[0]); var second = await TaskScenario.Read<ImmediateWorkResult>(races[1]); Assert.Equal(first.Work.Session.Id, second.Work.Session.Id);
        var replay = await TaskScenario.Read<ImmediateWorkResult>(await StartNow(s, b.Id, version, old, key)); Assert.True(replay.Replayed); Assert.Equal(first.Work.Session.Id, replay.Work.Session.Id); Assert.Equal(first.Plan!.Applied!.ChangeSetId, replay.Plan!.Applied!.ChangeSetId);
        Assert.Equal(HttpStatusCode.Conflict, (await StartNow(s, c.Id, version, old, key)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await StartNow(s, c.Id, (await Day(s)).PlanningVersion, old)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(2, await db.WorkSessions.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(1, await db.WorkSessions.CountAsync(x => x.UserId == s.UserId && x.State == WorkState.Running));
    }
    [Fact]
    public async Task DifferentSimultaneousInterruptionsHaveOneWinner()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var c = await s.Root(); var old = await WorkSessionTests.Started(s, a.Id); var version = (await Day(s)).PlanningVersion;
        var race = await Task.WhenAll(StartNow(s, b.Id, version, old), StartNow(s, c.Id, version, old)); Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.WorkSegments.CountAsync(x => x.UserId == s.UserId && x.EndedAt == null));
    }
    [Fact]
    public async Task StartWithNoCurrentSessionAndResumeExistingPausedTargetDoNotDuplicateSession()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var a = await s.Root(); await s.Define(a.Id, true, 1800); var b = await s.Root(); await s.Define(b.Id, true, 1800);
        var first = await TaskScenario.Read<ImmediateWorkResult>(await StartNow(s, a.Id, (await Day(s)).PlanningVersion)); Assert.Null(first.Work.PausedSession); Assert.False(first.Work.Resumed);
        app.Clock.Now = Morning.AddMinutes(5); var paused = await WorkSessionTests.Change(s, first.Work.Session, "pause"); var running = await WorkSessionTests.Started(s, b.Id); app.Clock.Now = Morning.AddMinutes(10);
        var resumed = await TaskScenario.Read<ImmediateWorkResult>(await StartNow(s, a.Id, (await Day(s)).PlanningVersion, running)); Assert.True(resumed.Work.Resumed); Assert.Equal(paused.Id, resumed.Work.Session.Id); Assert.Equal(paused.TaskAtStart!.CapturedAt, resumed.Work.Session.TaskAtStart!.CapturedAt); Assert.Equal(300m, resumed.Work.Session.ActiveSeconds);
        var segments = await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{paused.Id}/segments")); Assert.Equal(2, segments.Total); Assert.Equal(app.Clock.Now, Assert.Single(segments.Items, x => !x.EndedAt.HasValue).StartedAt);
        Assert.Equal(app.Clock.Now, Assert.Single(resumed.Plan!.Blocks, x => x.IsActive).StartsAt);
    }
    [Fact]
    public async Task FailedNewSegmentRollsBackOldPauseAndAllTaskEvents()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var running = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); var before = await Day(s); var key = Guid.NewGuid().ToString(); var task = await s.Get(a.Id);
        await using var db = fixture.CreateContext(); await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_emergency_work_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test work failure'; END $$; CREATE TRIGGER reject_emergency_work_test BEFORE INSERT ON work_session_segments FOR EACH ROW EXECUTE FUNCTION reject_emergency_work_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await StartNow(s, b.Id, before.PlanningVersion, running, key)).StatusCode);
            var current = (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!; Assert.Equal(running.Id, current.Id); Assert.Equal(running.Version, current.Version); Assert.Equal(1200m, current.ActiveSeconds); Assert.Equal(task.Version, (await s.Get(a.Id)).Version); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion);
            Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key)); Assert.Equal(1, await db.WorkSessions.CountAsync(x => x.UserId == s.UserId));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_emergency_work_test ON work_session_segments; DROP FUNCTION reject_emergency_work_test();"); }
    }
    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task FailedAutoPlanKeepsActualSwitchAndRetryCanRecoverPlan(bool inputsChanged)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto"); var a = await s.Root(); await s.Define(a.Id, true, 3600); var b = await s.Root(); await s.Define(b.Id, true, 1800); var old = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); var version = (await Day(s)).PlanningVersion; var key = Guid.NewGuid().ToString();
        await using var db = fixture.CreateContext(); await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_emergency_plan_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test plan failure'; END $$; CREATE TRIGGER reject_emergency_plan_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_emergency_plan_test();");
        ImmediateWorkResult result;
        try
        {
            var r = await StartNow(s, b.Id, version, old, key); Assert.Equal(HttpStatusCode.OK, r.StatusCode); result = await TaskScenario.Read<ImmediateWorkResult>(r); Assert.Equal("Unavailable", result.PlanningStatus); Assert.Null(result.Plan);
            Assert.Equal(result.Work.Session.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id); Assert.Equal(WorkState.Paused, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{old.Id}"))).State); Assert.Null((await Day(s)).Id);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_emergency_plan_test ON plan_revision_items; DROP FUNCTION reject_emergency_plan_test();"); }
        if (inputsChanged) await s.Define(a.Id, true, 7200);
        var retry = await TaskScenario.Read<ImmediateWorkResult>(await StartNow(s, b.Id, version, old, key)); Assert.True(retry.Replayed); Assert.Equal(result.Work.Session.Id, retry.Work.Session.Id);
        if (inputsChanged) { Assert.Equal("NeedsPreview", retry.PlanningStatus); Assert.Equal("planning_version_conflict", retry.PlanningError); Assert.Null(retry.Plan); }
        else { Assert.Equal("Applied", retry.PlanningStatus); Assert.NotNull(retry.Plan!.Applied); }
    }
    [Fact]
    public async Task OverrunReplanDoesNotFinishTaskCutActualOrMoveFixedMeeting()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto"); var a = await s.Root(); await s.Define(a.Id, true, 1800); var meeting = Assert.Single((await Create(s, null, Morning.AddMinutes(40), Morning.AddMinutes(70), "Break", true)).Schedules); var work = await WorkSessionTests.Started(s, a.Id);
        app.Clock.Now = Morning.AddMinutes(45); var response = await Send(s, HttpMethod.Post, "/api/scheduling/plan", new { date = "2026-10-15", taskIds = new[] { a.Id }, expectedPlanningVersion = (await Day(s)).PlanningVersion }); Assert.Equal(HttpStatusCode.OK, response.StatusCode); var plan = await TaskScenario.Read<SchedulingPreviewView>(response);
        Assert.True(plan.HasConstraintConflicts); Assert.Null(plan.Applied); Assert.Contains(plan.Warnings, x => x.Code == "ActiveEndUnknown"); Assert.Contains(plan.Warnings, x => x.Code == "ProtectedConflict");
        Assert.Equal(meeting.StartsAt, Assert.Single(plan.Blocks, x => x.ExistingScheduleId == meeting.Id).StartsAt); Assert.False((await s.Get(a.Id)).DirectWorkCompleted); Assert.Equal(TaskState.InProgress, (await s.Get(a.Id)).State);
        app.Clock.Now = Morning.AddMinutes(48); var current = (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!; Assert.Equal(work.Id, current.Id); Assert.Equal(2880m, current.ActiveSeconds); Assert.Equal(1080m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{a.Id}/time"))).KnownOvertimeSeconds);
    }
    [Fact]
    public async Task IneligibleForeignAndIncompleteInterruptionIntentCannotChangeActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var foreign = await other.Root(); var work = await WorkSessionTests.Started(s, a.Id); var version = (await Day(s)).PlanningVersion;
        Assert.Equal(HttpStatusCode.NotFound, (await StartNow(s, foreign.Id, version, work)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await StartNow(s, b.Id, version)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/work-sessions/start-now", new { taskId = b.Id, expectedPlanningVersion = version, expectedSessionId = work.Id })).StatusCode);
        await s.State(b.Id, TaskAction.Complete); Assert.Equal(HttpStatusCode.Conflict, (await StartNow(s, b.Id, (await Day(s)).PlanningVersion, work)).StatusCode);
        Assert.Equal(work.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
}
