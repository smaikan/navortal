using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class DistributionTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static async Task<DistributionPreviewView> Preview(TaskScenario s, params Guid[] tasks)
    {
        var r = await s.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = "2026-10-16", toDate = "2026-10-18", taskIds = tasks });
        Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<DistributionPreviewView>(r);
    }
    internal static Task<HttpResponseMessage> Apply(TaskScenario s, Guid id, string? key = null) => Send(s, HttpMethod.Post, "/api/scheduling/distribute-apply", new { proposalId = id }, key);
    [Fact]
    public async Task AutoWithUncertainOutsideActiveWorkReturnsPreviewWithoutStoppingActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto", end: 660); var t = await s.Root(); var running = await WorkSessionTests.Started(s, t.Id);
        var response = await Send(s, HttpMethod.Post, "/api/scheduling/distribute-plan", new { fromDate = "2026-10-16", toDate = "2026-10-18", taskIds = new[] { t.Id } }); Assert.Equal(HttpStatusCode.OK, response.StatusCode); var view = await TaskScenario.Read<DistributionPreviewView>(response); Assert.True(view.HasConstraintConflicts); Assert.Null(view.Applied); Assert.Equal("Pending", view.Status);
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.Equal(running.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
    [Theory] [InlineData("Preview")] [InlineData("Auto")]
    public async Task PlanPreferenceAndParallelIdempotencyWithExplicitVersionAreRespected(string mode)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, mode, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600); var version = (await Day(s)).PlanningVersion; var key = Guid.NewGuid().ToString();
        var body = new { fromDate = "2026-10-16", toDate = "2026-10-18", taskIds = new[] { t.Id }, expectedPlanningVersion = version };
        var race = await Task.WhenAll(Send(s, HttpMethod.Post, "/api/scheduling/distribute-plan", body, key), Send(s, HttpMethod.Post, "/api/scheduling/distribute-plan", body, key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        var a = await TaskScenario.Read<DistributionPreviewView>(race[0]); var b = await TaskScenario.Read<DistributionPreviewView>(race[1]); Assert.Equal(a.ProposalId, b.ProposalId); Assert.Equal(a.Applied?.ChangeSetId, b.Applied?.ChangeSetId); Assert.Equal(mode == "Auto", a.Applied is not null);
        var replay = await TaskScenario.Read<DistributionPreviewView>(await Send(s, HttpMethod.Post, "/api/scheduling/distribute-plan", body, key)); Assert.Equal(a.ProposalId, replay.ProposalId);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/scheduling/distribute-plan", new { fromDate = "2026-10-16", toDate = "2026-10-19", taskIds = new[] { t.Id }, expectedPlanningVersion = version }, key)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(mode == "Auto" ? 3 : 0, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task SixHoursUseOneTaskAcrossThreeDaysAndApplyAtomicallyWithSharedGroup()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, "Auto", end: 660); var t = await s.Root("Long project"); await s.Define(t.Id, true, 21600); var before = await Day(s);
        var p = await Preview(s, t.Id); Assert.Equal("distribution-v1", p.AlgorithmVersion); Assert.Equal(3, p.Days.Length); Assert.Empty(p.Unplaced); Assert.False(p.HasConstraintConflicts);
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId)); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion);
        var r = await Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(r); Assert.Equal(3, effect.RevisionIds.Length); Assert.Equal(before.PlanningVersion + 1, effect.PlanningVersion);
        var blocks = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == s.UserId).ToArrayAsync(); Assert.Equal(3, blocks.Length); Assert.All(blocks, x => Assert.Equal(t.Id, x.TaskId)); Assert.Equal(21600, blocks.Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds)); Assert.Single(blocks.Select(x => x.SplitGroupId).Distinct()); Assert.NotNull(blocks[0].SplitGroupId); Assert.Single(blocks.Select(x => x.OriginScheduleId).Distinct());
        Assert.Equal(1, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); var revisions = await db.PlanRevisions.Where(x => x.UserId == s.UserId).ToArrayAsync(); Assert.All(revisions, x => Assert.Equal(effect.ChangeSetId, x.ChangeSetId));
        Assert.Equal("Applied", (await TaskScenario.Read<DistributionPreviewView>(await s.Client.GetAsync($"/api/scheduling/distribution-proposals/{p.ProposalId}"))).Status);
        var again = await Preview(s, t.Id); Assert.All(again.Days, d => Assert.Empty(d.Changes)); Assert.True((await TaskScenario.Read<SchedulingApplyResult>(await Apply(s, again.ProposalId))).NoChanges);
    }
    [Fact]
    public async Task ExistingFlexibleRangeAllocationsAreReplacedWhileActualAndOutsideAreCountedOnce()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600);
        Assert.Equal(HttpStatusCode.Created, (await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = t.Id, startedAt = Morning.AddHours(-2), endedAt = Morning.AddHours(-1), reason = "Actual" })).StatusCode);
        await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); await Create(s, t.Id, Morning.AddDays(6), Morning.AddDays(6).AddHours(2));
        var p = await Preview(s, t.Id); Assert.Equal(10800, p.Days.SelectMany(x => x.Blocks).Where(x => x.TaskId == t.Id).Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds)); Assert.Empty(p.Unplaced); Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId)).StatusCode);
        var work = await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{t.Id}/time")); Assert.Equal(3600m, work.DirectActualSeconds); Assert.Equal(18000m, work.RemainingSeconds);
        var allocation = await TaskScenario.Read<TaskAllocation>(await s.Client.GetAsync($"/api/tasks/{t.Id}/allocation?" + Range(Morning, Morning.AddDays(10)))); Assert.Equal(18000m, allocation.AllocatedSeconds); Assert.Equal(0m, allocation.ExcessAllocatedSeconds);
    }
    [Fact]
    public async Task SameAndCompetingApplyRequestsHaveOneEffectAndWrongProposalKindsAreHidden()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600); var a = await Preview(s, t.Id); var b = await Preview(s, t.Id); var key = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.NotFound, (await SchedulingHttpTests.Apply(s, a.ProposalId)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await s.Client.GetAsync($"/api/scheduling/proposals/{a.ProposalId}")).StatusCode);
        var race = await Task.WhenAll(Apply(s, a.ProposalId, key), Apply(s, a.ProposalId, key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); Assert.Equal((await TaskScenario.Read<SchedulingApplyResult>(race[0])).ChangeSetId, (await TaskScenario.Read<SchedulingApplyResult>(race[1])).ChangeSetId);
        Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, b.ProposalId, key)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, b.ProposalId)).StatusCode);
        var replay = await Apply(s, a.ProposalId); Assert.Equal(HttpStatusCode.OK, replay.StatusCode); Assert.Equal("true", Assert.Single(replay.Headers.GetValues("Idempotent-Replay")));
        await using var db = fixture.CreateContext(); Assert.Equal(3, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ParallelDifferentRangesCannotReserveTheSameRemainingTwice()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600); var a = await Preview(s, t.Id);
        var response = await s.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = "2026-10-19", toDate = "2026-10-21", taskIds = new[] { t.Id } }); Assert.Equal(HttpStatusCode.OK, response.StatusCode); var b = await TaskScenario.Read<DistributionPreviewView>(response);
        var race = await Task.WhenAll(Apply(s, a.ProposalId), Apply(s, b.ProposalId)); Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        await using var db = fixture.CreateContext(); var rows = await db.TaskSchedules.Where(x => x.UserId == s.UserId && x.TaskId == t.Id && x.State == ScheduleState.Planned).ToArrayAsync(); Assert.Equal(21600, rows.Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds));
    }
    [Fact]
    public async Task SecondDayFailureRollsBackEveryDayProposalStatusAndKey()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600); var p = await Preview(s, t.Id); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_distribution_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM plan_revisions r JOIN daily_plans p ON p.\"Id\"=r.\"DailyPlanId\" WHERE r.\"Id\"=NEW.\"RevisionId\" AND p.\"LocalDate\"='2026-10-17') THEN RAISE EXCEPTION 'test distribution failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_distribution_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_distribution_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Apply(s, p.ProposalId, key)).StatusCode); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId)); Assert.Equal(p.InputVersion, (await Day(s)).PlanningVersion); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key)); Assert.Equal("Pending", (await db.SchedulingProposals.AsNoTracking().SingleAsync(x => x.Id == p.ProposalId)).Status);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_distribution_test ON plan_revision_items; DROP FUNCTION reject_distribution_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId, key)).StatusCode);
    }
    [Fact]
    public async Task StaleSettingsForeignResourcesAndExplicitRangeAreValidated()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 21600); var p = await Preview(s, t.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Apply(other, p.ProposalId)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/scheduling/distribution-proposals/{p.ProposalId}")).StatusCode);
        await SchedulingHttpTests.Configure(s, transition: 60); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, p.ProposalId)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = "2026-10-16", toDate = "2026-12-16", taskIds = new[] { t.Id } })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/scheduling/distribute-preview", new { fromDate = "2026-10-18", toDate = "2026-10-16", taskIds = new[] { t.Id } })).StatusCode);
    }
    [Theory] [InlineData(true)] [InlineData(false)]
    public async Task ActiveOutsideRangeIsForecastOnceOrBlocksUnknownAutomaticAssumption(bool known)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var a = await s.Root(); if (known) await s.Define(a.Id, true, 1800); var b = await s.Root(); await s.Define(b.Id, true, 3600); var work = await WorkSessionTests.Started(s, a.Id);
        var p = await Preview(s, a.Id, b.Id);
        if (known)
        {
            Assert.False(p.HasConstraintConflicts); Assert.DoesNotContain(p.Days.SelectMany(x => x.Blocks), x => x.TaskId == a.Id); Assert.Empty(p.Unplaced); Assert.Equal(HttpStatusCode.OK, (await Apply(s, p.ProposalId)).StatusCode);
        }
        else { Assert.True(p.HasConstraintConflicts); Assert.Contains(p.Days[0].Warnings, x => x.Code == "ActiveOutsideEndUnknown"); Assert.Equal(HttpStatusCode.Conflict, (await Apply(s, p.ProposalId)).StatusCode); }
        Assert.Equal(work.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
}
