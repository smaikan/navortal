using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Preferences;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class SchedulingHttpTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static async Task Configure(TaskScenario s, string mode = "Preview", int transition = 0, int end = 720)
    {
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        var response = await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with {
            PlanningMode = mode, TransitionSeconds = transition, Weekly = Enumerable.Range(0, 7).Select(d => new WeeklyWindow(d, 540, end)).ToArray() } });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
    internal static async Task<SchedulingPreviewView> Preview(TaskScenario s, params Guid[] ids)
    {
        var r = await s.Client.PostAsJsonAsync("/api/scheduling/preview", new { date = "2026-10-15", taskIds = ids });
        Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<SchedulingPreviewView>(r);
    }
    internal static Task<HttpResponseMessage> Apply(TaskScenario s, Guid id, string? key = null) => Send(s, HttpMethod.Post, "/api/scheduling/apply", new { proposalId = id }, key);
    [Fact]
    public async Task PreviewIsReadOnlyAndApplyFreezesFullBaselineWithAlgorithmAndMetadata()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s, transition: 300);
        var a = await s.Root("First"); await s.Define(a.Id, true, 1800); var b = await s.Root(); await s.Define(b.Id, true, 1200); var before = await Day(s);
        var p = await Preview(s, a.Id, b.Id); Assert.Equal("heuristic-v2", p.AlgorithmVersion); Assert.True(p.CanApply); Assert.NotEmpty(p.Explanations); Assert.NotEmpty(p.Changes);
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId)); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion);
        var r = await Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(r);
        Assert.False(effect.NoChanges); Assert.Single(effect.RevisionIds); var day = await Day(s); Assert.Equal(day.CurrentRevisionId, day.BaselineRevisionId); Assert.Equal(before.PlanningVersion + 1, day.PlanningVersion);
        var items = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{day.CurrentRevisionId}/items")); Assert.Equal(3, items.Total); Assert.All(items.Items, x => Assert.True(x.Schedule.IsAutomatic));
        Assert.Equal("First", Assert.Single(items.Items, x => x.Schedule.TaskId == a.Id).Schedule.TaskSnapshot!.Task.Title);
        Assert.Equal("heuristic-v2", (await db.PlanRevisions.SingleAsync(x => x.Id == day.CurrentRevisionId)).AlgorithmVersion);
        Assert.Equal("Applied", (await TaskScenario.Read<SchedulingPreviewView>(await s.Client.GetAsync($"/api/scheduling/proposals/{p.ProposalId}"))).Status);
        Assert.False(await db.WorkSessions.AnyAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ConcurrentSameCommandHasOneEffectAndKeysBindPayloadEvenOnAlreadyAppliedReplay()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800);
        var p = await Preview(s, t.Id); var key = Guid.NewGuid().ToString(); var race = await Task.WhenAll(Apply(s, p.ProposalId, key), Apply(s, p.ProposalId, key));
        Assert.All(race, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); var a = await TaskScenario.Read<SchedulingApplyResult>(race[0]); var b = await TaskScenario.Read<SchedulingApplyResult>(race[1]); Assert.Equal(a.ChangeSetId, b.ChangeSetId);
        var secondKey = Guid.NewGuid().ToString(); Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId, secondKey)).StatusCode);
        var other = await Preview(s, t.Id); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, other.ProposalId, key)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, other.ProposalId, secondKey)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task CompetingProposalsHaveOneWinnerAndUnchangedPlanCreatesNoEmptyRevision()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800);
        var a = await Preview(s, t.Id); var b = await Preview(s, t.Id); var race = await Task.WhenAll(Apply(s, a.ProposalId), Apply(s, b.ProposalId));
        Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        var current = await Day(s); var unchanged = await Preview(s, t.Id); Assert.Empty(unchanged.Changes); var effect = await TaskScenario.Read<SchedulingApplyResult>(await Apply(s, unchanged.ProposalId));
        Assert.True(effect.NoChanges); Assert.Null(effect.ChangeSetId); Assert.Empty(effect.RevisionIds); Assert.Equal(current.PlanningVersion, effect.PlanningVersion); Assert.Equal(current.CurrentRevisionId, (await Day(s)).CurrentRevisionId);
    }
    [Theory] [InlineData("task")] [InlineData("preferences")] [InlineData("work")] [InlineData("plan")]
    public async Task ChangedInputsCannotBeApplied(string changed)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800); var p = await Preview(s, t.Id);
        if (changed == "task") { t = await s.Get(t.Id); Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{t.Id}", new { t.Version, title = "Changed" })).StatusCode); }
        if (changed == "preferences") await Configure(s, transition: 60);
        if (changed == "work") await WorkSessionTests.Started(s, t.Id);
        if (changed == "plan") await Create(s, null, Morning.AddHours(2), Morning.AddHours(2.5), "Break");
        var r = await Apply(s, p.ProposalId); Assert.Equal(HttpStatusCode.Conflict, r.StatusCode); Assert.Contains("proposal_stale", await r.Content.ReadAsStringAsync());
    }
    [Theory] [InlineData(61)] [InlineData(121)]
    public async Task ElapsedNewStartOrExpiredProposalRequiresNewPreview(int seconds)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800); var p = await Preview(s, t.Id);
        app.Clock.Now = Morning.AddSeconds(seconds); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, p.ProposalId)).StatusCode);
        var read = await TaskScenario.Read<SchedulingPreviewView>(await s.Client.GetAsync($"/api/scheduling/proposals/{p.ProposalId}")); Assert.Equal(seconds > 120 ? "Expired" : "Pending", read.Status);
    }
    [Fact]
    public async Task ActiveTimerTicksDoNotInvalidatePreviewOrRewriteOriginalStartContext()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var a = await s.Root(); await s.Define(a.Id, true, 3600); var b = await s.Root(); await s.Define(b.Id, true, 1800);
        var started = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); var p = await Preview(s, a.Id, b.Id); Assert.False(p.HasConstraintConflicts);
        app.Clock.Now = app.Clock.Now.AddSeconds(15); var r = await Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync());
        var current = (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!; Assert.Equal(started.Id, current.Id); Assert.Equal(1215m, current.ActiveSeconds); Assert.Null(current.StartedScheduleId); Assert.Null(current.StartedRevisionItemId);
        Assert.Equal(Morning.AddHours(1), Assert.Single(p.Blocks, x => x.IsActive).EndsAt);
        var repeated = await Preview(s, a.Id, b.Id); Assert.Empty(repeated.Changes); Assert.Single(repeated.Blocks, x => x.TaskId == a.Id);
    }
    [Theory] [InlineData("Preview")] [InlineData("Auto")]
    public async Task PlanRespectsPreferenceAndExplicitPreviewNeverApplies(string mode)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s, mode); var t = await s.Root(); await s.Define(t.Id, true, 1800); _ = await Preview(s, t.Id); Assert.Null((await Day(s)).Id);
        var body = new { date = "2026-10-15", taskIds = new[] { t.Id } }; var key = Guid.NewGuid().ToString();
        var first = await Send(s, HttpMethod.Post, "/api/scheduling/plan", body, key); Assert.True(first.StatusCode == HttpStatusCode.OK, await first.Content.ReadAsStringAsync()); var view = await TaskScenario.Read<SchedulingPreviewView>(first);
        Assert.Equal(mode == "Auto", view.Applied is not null); Assert.Equal(mode == "Auto", (await Day(s)).Id is not null);
        var replay = await TaskScenario.Read<SchedulingPreviewView>(await Send(s, HttpMethod.Post, "/api/scheduling/plan", body, key)); Assert.Equal(view.ProposalId, replay.ProposalId); Assert.Equal(view.Applied?.ChangeSetId, replay.Applied?.ChangeSetId);
    }
    [Fact]
    public async Task AutoKeepsConflictingActiveWorkAsPreviewAndReportsPartialAndUnknownWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s, "Auto", end: 600); var unknown = await s.Root(); await WorkSessionTests.Started(s, unknown.Id);
        var response = await Send(s, HttpMethod.Post, "/api/scheduling/plan", new { date = "2026-10-15", taskIds = new[] { unknown.Id } }); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var view = await TaskScenario.Read<SchedulingPreviewView>(response); Assert.True(view.HasConstraintConflicts); Assert.Null(view.Applied); Assert.False(view.CanApply); Assert.Null((await Day(s)).Id); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, view.ProposalId)).StatusCode);
        var other = await TaskScenario.User(app); await Configure(other, end: 600); var longTask = await other.Root(); await other.Define(longTask.Id, true, 5400); var noEstimate = await other.Root();
        var partial = await Preview(other, longTask.Id, noEstimate.Id); Assert.False(partial.HasConstraintConflicts); Assert.Equal(3540m, partial.Blocks.Where(x => x.TaskId == longTask.Id).Sum(x => (decimal)(x.EndsAt - x.StartsAt).TotalSeconds));
        Assert.Equal(1860m, Assert.Single(partial.Unplaced, x => x.TaskId == longTask.Id).RemainingSeconds); Assert.Null(Assert.Single(partial.Unplaced, x => x.TaskId == noEstimate.Id).RemainingSeconds);
    }
    [Fact]
    public async Task ForeignProposalAndTasksAreHiddenAndRequestValidationIsExplicit()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); await Configure(a); var t = await a.Root(); await a.Define(t.Id, true, 1800); var p = await Preview(a, t.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Apply(b, p.ProposalId)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync($"/api/scheduling/proposals/{p.ProposalId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await b.Client.PostAsJsonAsync("/api/scheduling/preview", new { date = "2026-10-15", taskIds = new[] { t.Id } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.PostAsJsonAsync("/api/scheduling/apply", new { proposalId = p.ProposalId })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await a.Client.PostAsJsonAsync("/api/scheduling/preview", new { date = "2026-10-15", taskIds = new[] { t.Id, t.Id } })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync($"/api/scheduling/proposals/{p.ProposalId}")).StatusCode);
    }
    [Fact]
    public async Task ExactActualAndOtherDayReservationAreSubtractedOnceAndCorrectionMakesProposalStale()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 5400);
        var manual = await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = t.Id, startedAt = Morning.AddMinutes(-30), endedAt = Morning.AddMinutes(-10).AddTicks(1234560), reason = "Exact actual" });
        Assert.Equal(HttpStatusCode.Created, manual.StatusCode); var work = await TaskScenario.Read<WorkView>(manual);
        await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddMinutes(30)); var p = await Preview(s, t.Id);
        var placed = p.Blocks.Where(x => x.TaskId == t.Id).Sum(x => (x.EndsAt.UtcTicks - x.StartsAt.UtcTicks) / (decimal)TimeSpan.TicksPerSecond);
        Assert.Equal(2399.876544m, placed); Assert.Empty(p.Unplaced); var r = await Apply(s, p.ProposalId); Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        var stale = await Preview(s, t.Id); var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = segment.StartedAt, endedAt = Morning.AddMinutes(-20), isVoided = false, reason = "Düzeltme" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, stale.ProposalId)).StatusCode);
    }
    [Fact]
    public async Task AutomaticBufferReuseIsStableAndManualEditTakesOwnershipWhileFixedBlockStays()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s, transition: 300); var a = await s.Root(); await s.Define(a.Id, true, 1800); var b = await s.Root(); await s.Define(b.Id, true, 1200);
        var fixedBlock = Assert.Single((await Create(s, null, Morning.AddHours(2), Morning.AddHours(2.5), "Break", true)).Schedules);
        var p = await Preview(s, a.Id, b.Id); Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId)).StatusCode);
        var again = await Preview(s, a.Id, b.Id); Assert.Empty(again.Changes); Assert.Equal(HttpStatusCode.OK, (await Apply(s, again.ProposalId)).StatusCode);
        var buffer = Assert.Single((await TaskScenario.Read<SchedulePage>(await s.Client.GetAsync("/api/schedules?" + Range(Morning, Morning.AddDays(1))))).Items, x => x.Kind == ScheduleKind.Buffer);
        Assert.True(buffer.IsAutomatic); var edited = await Change(s, buffer); Assert.Equal(HttpStatusCode.OK, edited.StatusCode); Assert.False(Assert.Single((await TaskScenario.Read<PlanMutation>(edited)).Schedules).IsAutomatic);
        var keep = await Preview(s, a.Id, b.Id); Assert.Contains(keep.Blocks, x => x.ExistingScheduleId == buffer.Id && !x.IsAutomatic); Assert.DoesNotContain(keep.Changes, x => x.ScheduleId == fixedBlock.Id);
    }
    [Fact]
    public async Task StoredProposalIntegrityAndCurrentPlanVersionAreVerified()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800); var p = await Preview(s, t.Id);
        await using var db = fixture.CreateContext(); await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE scheduling_proposals SET \"Input\"=jsonb_set(\"Input\",'{{snapshot,planningVersion}}','999'::jsonb) WHERE \"Id\"={p.ProposalId}");
        Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, p.ProposalId)).StatusCode); Assert.Null((await Day(s)).Id);
    }
    [Fact]
    public async Task SnapshotFailureRollsBackAllEffectsAndPendingProposalCanBeRetried()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 1800); var p = await Preview(s, t.Id); var key = Guid.NewGuid().ToString();
        await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_scheduling_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test snapshot failure'; END $$; CREATE TRIGGER reject_scheduling_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_scheduling_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Apply(s, p.ProposalId, key)).StatusCode);
            Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
            Assert.Equal("Pending", (await db.SchedulingProposals.AsNoTracking().SingleAsync(x => x.Id == p.ProposalId)).Status); Assert.Equal(p.InputVersion, (await Day(s)).PlanningVersion);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_scheduling_test ON plan_revision_items; DROP FUNCTION reject_scheduling_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId, key)).StatusCode);
    }
}
