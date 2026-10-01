using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Calendar;
using Adhd.Application.Focus;
using Adhd.Application.Work;
using Adhd.Domain.Focus;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class FocusTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body, string? key = null) => ManualPlanningTests.Send(s, method, path, JsonSerializer.SerializeToElement(body, Json), key);
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static async Task<FocusView> Start(TaskScenario s, Guid? task = null, FocusSettings? settings = null, string? key = null)
    {
        var r = await Send(s, HttpMethod.Post, "/api/focus-sessions", new FocusStart(task, Settings: settings), key); Assert.True(r.StatusCode == HttpStatusCode.Created, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<FocusView>(r);
    }
    private static async Task<FocusView> Get(TaskScenario s, Guid id)
    {
        var r = await s.Client.GetAsync($"/api/focus-sessions/{id}"); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<FocusView>(r);
    }
    private static Task<HttpResponseMessage> Change(TaskScenario s, FocusView f, string action, bool skip = false, string? key = null) => Send(s, HttpMethod.Post, $"/api/focus-sessions/{f.Id}/{action}", new FocusCommand(f.Version, f.WorkSessionVersion, skip), key);
    private static async Task<FocusView> Changed(TaskScenario s, FocusView f, string action, bool skip = false)
    {
        var r = await Change(s, f, action, skip); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<FocusView>(r);
    }
    [Fact]
    public async Task ThirtyFiveSevenPausesExcludeGapAndContinueTrackingRetainsOvertimeAndTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); await s.Define(t.Id, true, 5400);
        var f = await Start(s, t.Id, new(2100, 420)); app.Clock.Now = Morning.AddMinutes(20); f = await Changed(s, f, "pause"); Assert.Equal(1200m, f.ActiveSeconds);
        app.Clock.Now = Morning.AddMinutes(50); f = await Get(s, f.Id); Assert.Equal(900m, f.RemainingSeconds); f = await Changed(s, f, "resume");
        app.Clock.Now = Morning.AddMinutes(78); f = await Get(s, f.Id); Assert.Equal(2880m, f.ActiveSeconds); Assert.Equal(780m, f.OvertimeSeconds); Assert.Equal(Morning.AddMinutes(65), f.TargetReachedAt); Assert.Equal(f.Id, f.TargetEventId); Assert.Equal(FocusState.Working, f.State);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}")); Assert.Equal(2880m, work.ActiveSeconds); Assert.Equal(WorkState.Running, work.State); Assert.Equal(TaskState.InProgress, (await s.Get(t.Id)).State);
        f = await Changed(s, f, "break"); Assert.Equal(FocusState.Break, f.State); app.Clock.Now = app.Clock.Now.AddMinutes(7); f = await Get(s, f.Id); Assert.Equal(FocusState.AwaitingNext, f.State); Assert.Equal(2880m, f.ActiveSeconds); Assert.Equal(0m, f.BreakRemainingSeconds);
        var next = await Changed(s, f, "next"); Assert.Equal(2, next.CycleNumber); Assert.Equal(f.Id, next.PreviousFocusId); Assert.Equal(f.WorkSessionId, next.WorkSessionId); Assert.Equal(0m, next.ActiveSeconds);
        app.Clock.Now = app.Clock.Now.AddMinutes(5); var day = await TaskScenario.Read<CalendarDayView>(await s.Client.GetAsync("/api/calendar/days/2026-10-15")); Assert.Equal(3180m, day.Summary.ActualSeconds); Assert.Equal(3180m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{t.Id}/time"))).DirectActualSeconds);
    }
    [Fact]
    public async Task TargetObservationIsSingleAcrossReloadParallelReadersAndHostRestart()
    {
        Guid user; FocusView f; string token; HttpClient original;
        await using (var app = new PlannerFactory(fixture.ConnectionString))
        {
            app.Clock.Now = Morning; var s = await TaskScenario.User(app); user = s.UserId; original = s.Client; token = original.DefaultRequestHeaders.Authorization!.Parameter!; f = await Start(s, settings: new(300)); app.Clock.Now = Morning.AddMinutes(6);
            var race = await Task.WhenAll(Get(s, f.Id), Get(s, f.Id)); Assert.Equal(race[0].Version, race[1].Version); Assert.Equal(race[0].TargetEventId, race[1].TargetEventId); f = race[0];
        }
        await using var restarted = new PlannerFactory(fixture.ConnectionString); restarted.Clock.Now = Morning.AddMinutes(10); var client = restarted.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", token); var resumed = await Get(new(client, user), f.Id);
        Assert.Equal(f.Version, resumed.Version); Assert.Equal(Morning.AddMinutes(5), resumed.TargetReachedAt); Assert.Equal(600m, resumed.ActiveSeconds); Assert.Equal(300m, resumed.OvertimeSeconds); Assert.Null(resumed.TaskId); Assert.Null(resumed.EndedAt);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.FocusSessions.CountAsync(x => x.UserId == user)); Assert.Equal(1, await db.WorkSessions.CountAsync(x => x.UserId == user));
    }
    [Fact]
    public async Task AutoBreakOccursOnceAtServerObservationAndWaitsForExplicitNextAfterLongOfflineGap()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var f = await Start(s, settings: new(300, 120, 600, 2, FocusTargetBehavior.AutoBreak));
        app.Clock.Now = Morning.AddHours(8); f = await Get(s, f.Id); Assert.Equal(FocusState.Break, f.State); Assert.Equal(28800m, f.ActiveSeconds); Assert.Equal(Morning.AddMinutes(5), f.TargetReachedAt); Assert.Equal(app.Clock.Now, f.BreakStartedAt);
        app.Clock.Now = app.Clock.Now.AddHours(8); f = await Get(s, f.Id); Assert.Equal(FocusState.AwaitingNext, f.State); Assert.Equal(28800m, f.ActiveSeconds); Assert.Equal(120m, f.BreakElapsedSeconds);
        var next = await Changed(s, f, "next"); Assert.Equal(2, next.CycleNumber); Assert.Equal(600, next.BreakTargetSeconds); app.Clock.Now = app.Clock.Now.AddMinutes(5); next = await Get(s, next.Id); Assert.Equal(FocusState.Break, next.State);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(s, next, "next")).StatusCode); var third = await Changed(s, next, "next", skip: true); Assert.Equal(3, third.CycleNumber); Assert.Equal(120, third.BreakTargetSeconds);
        await using var db = fixture.CreateContext(); Assert.Equal(3, await db.FocusSessions.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(1, await db.WorkSessions.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task PresetEditsDoNotRewriteRunningSnapshotAndBuiltInsSupportCustomDurations()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var r = await s.Client.PostAsJsonAsync("/api/focus-presets", new { name = "35/7", settings = new FocusSettings(2100, 420, 1200, 3, SoundEnabled: false) }, Json); Assert.Equal(HttpStatusCode.Created, r.StatusCode); var p = await TaskScenario.Read<FocusPresetView>(r);
        var f = await TaskScenario.Read<FocusView>(await Send(s, HttpMethod.Post, "/api/focus-sessions", new FocusStart(PresetId: p.Id)));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/focus-presets/{p.Id}", new { version = p.Version, name = "15/5", settings = new FocusSettings(900) }, Json)).StatusCode);
        f = await Get(s, f.Id); Assert.Equal(2100, f.Settings.WorkSeconds); Assert.Equal(420, f.Settings.ShortBreakSeconds); Assert.Equal("35/7", f.PresetName); Assert.False(f.Settings.SoundEnabled);
        var list = await TaskScenario.Read<FocusPresetPage>(await s.Client.GetAsync("/api/focus-presets")); Assert.Equal(3, list.BuiltIns.Length); Assert.Equal(900, Assert.Single(list.Items).Settings.WorkSeconds); Assert.Empty((await TaskScenario.Read<FocusPresetPage>(await other.Client.GetAsync("/api/focus-presets"))).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(other, HttpMethod.Post, "/api/focus-sessions", new FocusStart(PresetId: p.Id))).StatusCode);
    }
    [Fact]
    public async Task PlainWorkPauseResumeCompletionAndImmediateSwitchKeepFocusConsistent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var f = await Start(s, a.Id); app.Clock.Now = Morning.AddMinutes(5);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}")); work = await WorkSessionTests.Change(s, work, "pause"); f = await Get(s, f.Id); Assert.Equal(FocusState.Paused, f.State);
        work = await WorkSessionTests.Change(s, work, "resume"); f = await Get(s, f.Id); Assert.Equal(FocusState.Working, f.State);
        var current = await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current")); var switched = await Send(s, HttpMethod.Post, "/api/work-sessions/start-now", new { taskId = b.Id, expectedPlanningVersion = current.PlanningVersion, expectedSessionId = work.Id, expectedSessionVersion = work.Version }); Assert.Equal(HttpStatusCode.OK, switched.StatusCode); Assert.Equal(FocusState.Paused, (await Get(s, f.Id)).State);
        await s.State(a.Id, TaskAction.Complete); var ended = await Get(s, f.Id); Assert.Equal(FocusState.Finished, ended.State); Assert.Equal(300m, ended.ActiveSeconds); Assert.Null((await TaskScenario.Read<FocusCurrent>(await s.Client.GetAsync("/api/focus-sessions/current"))).Session);
    }
    [Fact]
    public async Task ExistingWorkCanBeFocusedWithoutCountingItsEarlierMinutesAndPlainBreakResumeInterruptsCycle()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var work = await WorkSessionTests.Started(s, t.Id); app.Clock.Now = Morning.AddMinutes(10);
        var r = await Send(s, HttpMethod.Post, "/api/focus-sessions", new FocusStart(t.Id, work.Id, work.Version, Settings: new(300))); Assert.Equal(HttpStatusCode.Created, r.StatusCode); var f = await TaskScenario.Read<FocusView>(r); app.Clock.Now = Morning.AddMinutes(15); f = await Get(s, f.Id); Assert.Equal(300m, f.ActiveSeconds); f = await Changed(s, f, "break");
        work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); app.Clock.Now = app.Clock.Now.AddMinutes(1); await WorkSessionTests.Change(s, work, "resume"); f = await Get(s, f.Id); Assert.Equal(FocusState.Interrupted, f.State); Assert.Equal(300m, f.ActiveSeconds);
        Assert.Equal(TaskState.InProgress, (await s.Get(t.Id)).State);
    }
    [Fact]
    public async Task ParallelStartsAndNextCommandsHaveOneCycleAndKeysBindIntent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var key = Guid.NewGuid().ToString(); var body = new FocusStart(Settings: new(300));
        var race = await Task.WhenAll(Send(s, HttpMethod.Post, "/api/focus-sessions", body, key), Send(s, HttpMethod.Post, "/api/focus-sessions", body, key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode)); var f = await TaskScenario.Read<FocusView>(race[0]); Assert.Equal(f.Id, (await TaskScenario.Read<FocusView>(race[1])).Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/focus-sessions", new FocusStart(Settings: new(600)), key)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/focus-sessions", body)).StatusCode); app.Clock.Now = Morning.AddMinutes(5); f = await Get(s, f.Id); f = await Changed(s, f, "break");
        var nextKey = Guid.NewGuid().ToString(); var nextRace = await Task.WhenAll(Change(s, f, "next", true, nextKey), Change(s, f, "next", true, nextKey)); Assert.All(nextRace, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); var n = await TaskScenario.Read<FocusView>(nextRace[0]); Assert.Equal(n.Id, (await TaskScenario.Read<FocusView>(nextRace[1])).Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(s, f, "finish")).StatusCode); await using var db = fixture.CreateContext(); Assert.Equal(2, await db.FocusSessions.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(1, await db.WorkSegments.CountAsync(x => x.UserId == s.UserId && x.EndedAt == null));
    }
    [Fact]
    public async Task CancelAndCorrectionsPreserveActualAndHistoricalTargetEventWithoutDoubleCounting()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var f = await Start(s, t.Id, new(300)); app.Clock.Now = Morning.AddMinutes(6); f = await Get(s, f.Id); f = await Changed(s, f, "cancel"); Assert.Equal(FocusState.Interrupted, f.State); Assert.Equal(360m, f.ActiveSeconds); Assert.Equal(TaskState.Paused, (await s.Get(t.Id)).State);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}")); var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = Morning, endedAt = Morning.AddMinutes(2), isVoided = false, reason = "Açık unutulmuş" })).StatusCode);
        var corrected = await Get(s, f.Id); Assert.Equal(120m, corrected.ActiveSeconds); Assert.False(corrected.EffectiveTargetReached); Assert.Equal(f.TargetEventId, corrected.TargetEventId); Assert.Equal(f.TargetReachedAt, corrected.TargetReachedAt);
        Assert.Equal(120m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{t.Id}/time"))).DirectActualSeconds);
    }
    [Fact]
    public async Task OwnerInvalidSettingsAndVersionsAreCheckedAndGeneralFocusIsDailyActualOnly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var f = await Start(s);
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/focus-sessions/{f.Id}")).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await Change(other, f, "pause")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/focus-sessions?limit=101")).StatusCode); Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/focus-presets", new { name = "Invalid", settings = new FocusSettings(0) })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Change(s, f, "unknown")).StatusCode); app.Clock.Now = Morning.AddMinutes(3); f = await Changed(s, f, "finish"); Assert.Equal(180m, f.ActiveSeconds);
        var day = await TaskScenario.Read<CalendarDayView>(await s.Client.GetAsync("/api/calendar/days/2026-10-15")); Assert.Equal(180m, day.Summary.ActualSeconds); Assert.Null(Assert.Single(day.Actual.Items).TaskId);
        var list = await TaskScenario.Read<FocusPage>(await s.Client.GetAsync("/api/focus-sessions?limit=1")); Assert.Single(list.Items); Assert.Equal(1, list.Total);
    }
    [Fact]
    public async Task NextCycleInsertFailureRollsBackPreviousClosureWorkResumeVersionsAndReceipt()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var f = await Start(s, t.Id); app.Clock.Now = Morning.AddMinutes(5); f = await Changed(s, f, "break");
        var beforeTask = await s.Get(t.Id); var beforePlan = await Day(s); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_focus_next_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"PreviousFocusId\" IS NOT NULL THEN RAISE EXCEPTION 'test next focus failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_focus_next_test BEFORE INSERT ON focus_sessions FOR EACH ROW EXECUTE FUNCTION reject_focus_next_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Change(s, f, "next", true, key)).StatusCode); var original = await Get(s, f.Id); Assert.Equal(FocusState.Break, original.State); Assert.Equal(f.Version, original.Version); Assert.Equal(f.WorkSessionVersion, original.WorkSessionVersion);
            Assert.Equal(beforeTask.Version, (await s.Get(t.Id)).Version); Assert.Equal(beforePlan.PlanningVersion, (await Day(s)).PlanningVersion); Assert.Equal(1, await db.FocusSessions.CountAsync(x => x.UserId == s.UserId)); Assert.False(await db.WorkSegments.AnyAsync(x => x.UserId == s.UserId && x.EndedAt == null)); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_focus_next_test ON focus_sessions; DROP FUNCTION reject_focus_next_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await Change(s, f, "next", true, key)).StatusCode);
    }
    [Fact]
    public async Task DatabaseRejectsForeignWorkLinkAndDuplicateActiveFocusEvenWithoutHttpGuards()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var f = await Start(s);
        await using var db = fixture.CreateContext();
        db.FocusSessions.Add(new() { Id = Guid.NewGuid(), UserId = other.UserId, WorkSessionId = f.WorkSessionId, StartedAt = Morning });
        var foreign = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal("23503", ((Npgsql.PostgresException)foreign.InnerException!).SqlState); db.ChangeTracker.Clear();
        db.FocusSessions.Add(new() { Id = Guid.NewGuid(), UserId = s.UserId, WorkSessionId = f.WorkSessionId, StartedAt = Morning });
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal("23505", ((Npgsql.PostgresException)duplicate.InnerException!).SqlState); db.ChangeTracker.Clear();
        Assert.Equal(FocusState.Working, (await Get(s, f.Id)).State);
    }
    [Fact]
    public async Task ExplicitActionAtAutoBreakDeadlineWinsAndBackwardClockProducesConflict()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var f = await Start(s, settings: new(300, TargetBehavior: FocusTargetBehavior.AutoBreak));
        app.Clock.Now = Morning.AddMinutes(6); f = await Changed(s, f, "pause"); Assert.Equal(FocusState.Paused, f.State); Assert.Equal(360m, f.ActiveSeconds); Assert.NotNull(f.TargetEventId);
        app.Clock.Now = Morning.AddMinutes(4); Assert.Equal(HttpStatusCode.Conflict, (await s.Client.GetAsync($"/api/focus-sessions/{f.Id}")).StatusCode);
        app.Clock.Now = Morning.AddMinutes(7); f = await Changed(s, f, "break"); Assert.Equal(FocusState.Break, f.State); Assert.Equal(360m, f.ActiveSeconds);
    }
    [Fact]
    public async Task GeneralFocusCannotBeSilentlyOverplannedAndEmergencyStartIsAnExplicitInterruption()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var task = await s.Root(); await s.Define(task.Id, true, 1800); var f = await Start(s, settings: new(300));
        var blocked = await s.Client.PostAsJsonAsync("/api/scheduling/preview", new { date = "2026-10-15", taskIds = new[] { task.Id } }); Assert.Equal(HttpStatusCode.Conflict, blocked.StatusCode); Assert.Contains("general_work_active", await blocked.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = "2026-10-16", toDate = "2026-10-17", taskIds = new[] { task.Id } })).StatusCode);
        app.Clock.Now = Morning.AddMinutes(2); var current = await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current")); var r = await Send(s, HttpMethod.Post, "/api/work-sessions/start-now", new { taskId = task.Id, expectedPlanningVersion = current.PlanningVersion, expectedSessionId = f.WorkSessionId, expectedSessionVersion = f.WorkSessionVersion }); Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        f = await Get(s, f.Id); Assert.Equal(FocusState.Paused, f.State); Assert.Equal(120m, f.ActiveSeconds); Assert.Equal(task.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.TaskId);
    }
}
