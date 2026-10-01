using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class MultiDayUndoTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static async Task<DistributionPreviewView> Preview(TaskScenario s, Guid group)
    {
        var r = await s.Client.PostAsJsonAsync("/api/scheduling/undo-multi-preview", new { changeSetId = group }); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<DistributionPreviewView>(r);
    }
    [Fact]
    public async Task MoveUndoReturnsSameBlockWithBothCompensationRevisionsAndKeepsOriginalActualContext()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 7200); var original = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); var block = original.Schedules[0];
        var started = await TaskScenario.Read<WorkView>(await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = t.Id, scheduleId = block.Id, scheduleVersion = block.Version })); app.Clock.Now = Morning.AddMinutes(10); var paused = await WorkSessionTests.Change(s, started, "pause");
        var moved = await TaskScenario.Read<PlanMutation>(await MultiDayMoveTests.Move(s, block, new(2026, 10, 17), Morning.AddDays(2), (await Day(s)).PlanningVersion)); var p = await Preview(s, moved.ChangeSetId); Assert.False(p.IsPartial); Assert.Equal("undo-multi-v1", p.AlgorithmVersion); Assert.Equal(2, p.Days.Length);
        var r = await DistributionTests.Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(r); Assert.Equal(2, effect.RevisionIds.Length); var restored = await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{block.Id}")); Assert.Equal(block.DailyPlanId, restored.DailyPlanId); Assert.Equal(block.StartsAt, restored.StartsAt); Assert.Equal(block.Id, restored.Id); Assert.Equal(block.SplitGroupId, restored.SplitGroupId); Assert.Equal(block.OriginScheduleId, restored.OriginScheduleId);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{paused.Id}")); Assert.Equal(paused.ActiveSeconds, work.ActiveSeconds); Assert.Equal(started.StartedRevisionItemId, work.StartedRevisionItemId); Assert.Equal(original.RevisionIds[0], (await Day(s, new(2026, 10, 16))).BaselineRevisionId);
        await using var db = fixture.CreateContext(); var revisions = await db.PlanRevisions.Where(x => effect.RevisionIds.Contains(x.Id)).ToArrayAsync(); Assert.All(revisions, x => { Assert.Equal(moved.ChangeSetId, x.ReversesChangeSetId); Assert.Equal(effect.ChangeSetId, x.ChangeSetId); Assert.Equal("Undo", x.Trigger); });
    }
    [Fact]
    public async Task DistributionUndoIsPartialAfterCompletionAndDoesNotEraseActualOrReopenTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var a = await s.Root(); await s.Define(a.Id, true, 10800); var b = await s.Root(); await s.Define(b.Id, true, 10800);
        var generated = await DistributionTests.Preview(s, a.Id, b.Id); var accepted = await TaskScenario.Read<SchedulingApplyResult>(await DistributionTests.Apply(s, generated.ProposalId)); var work = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); await s.State(a.Id, TaskAction.Complete); var completed = await s.Get(a.Id);
        var p = await Preview(s, accepted.ChangeSetId!.Value); Assert.True(p.IsPartial); Assert.Contains(p.Days.SelectMany(x => x.Changes), x => x.TaskId == b.Id && x.Type == "Removed"); Assert.DoesNotContain(p.Days.SelectMany(x => x.Changes), x => x.TaskId == a.Id);
        var response = await DistributionTests.Apply(s, p.ProposalId); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync()); Assert.Equal(completed.Version, (await s.Get(a.Id)).Version); Assert.Equal(TaskState.Completed, (await s.Get(a.Id)).State); Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).ActiveSeconds);
        await using var db = fixture.CreateContext(); Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId && x.TaskId == b.Id && x.State == ScheduleState.Planned)); Assert.True(await db.PlanRevisionItems.AnyAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ActiveTaskOutsideFutureDaysMakesMoveInverseExplicitNoOp()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 7200); var made = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); var moved = await TaskScenario.Read<PlanMutation>(await MultiDayMoveTests.Move(s, made.Schedules[0], new(2026, 10, 17), Morning.AddDays(2), (await Day(s)).PlanningVersion));
        var running = await WorkSessionTests.Started(s, t.Id); var p = await Preview(s, moved.ChangeSetId); Assert.True(p.IsPartial); Assert.Contains(p.Days.SelectMany(x => x.Warnings), x => x.Code == "UndoActiveWorkProtected"); Assert.All(p.Days, x => Assert.Empty(x.Changes));
        var response = await DistributionTests.Apply(s, p.ProposalId); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync()); Assert.True((await TaskScenario.Read<SchedulingApplyResult>(response)).NoChanges); Assert.Equal(moved.Schedules[0].DailyPlanId, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{made.Schedules[0].Id}"))).DailyPlanId); Assert.Equal(running.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
    [Fact]
    public async Task SecondDayUndoFailureRollsBackRestoredSourceAndRemovedTarget()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 7200); var made = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); await Create(s, null, Morning.AddDays(2).AddHours(1), Morning.AddDays(2).AddHours(1.5), "Break"); var moved = await TaskScenario.Read<PlanMutation>(await MultiDayMoveTests.Move(s, made.Schedules[0], new(2026, 10, 17), Morning.AddDays(2), (await Day(s)).PlanningVersion)); var p = await Preview(s, moved.ChangeSetId); var key = Guid.NewGuid().ToString(); var sourceBefore = await Day(s, new(2026, 10, 16)); var targetBefore = await Day(s, new(2026, 10, 17)); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_multi_undo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM plan_revisions r JOIN daily_plans p ON p.\"Id\"=r.\"DailyPlanId\" WHERE r.\"Id\"=NEW.\"RevisionId\" AND p.\"LocalDate\"='2026-10-17') THEN RAISE EXCEPTION 'test second undo snapshot failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_multi_undo_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_multi_undo_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await DistributionTests.Apply(s, p.ProposalId, key)).StatusCode); Assert.Equal(sourceBefore.CurrentRevisionId, (await Day(s, new(2026, 10, 16))).CurrentRevisionId); Assert.Equal(targetBefore.CurrentRevisionId, (await Day(s, new(2026, 10, 17))).CurrentRevisionId); Assert.Equal(sourceBefore.PlanningVersion, (await Day(s)).PlanningVersion); Assert.Equal(moved.Schedules[0].DailyPlanId, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == made.Schedules[0].Id)).DailyPlanId); Assert.Equal("Pending", (await db.SchedulingProposals.AsNoTracking().SingleAsync(x => x.Id == p.ProposalId)).Status); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_multi_undo_test ON plan_revision_items; DROP FUNCTION reject_multi_undo_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await DistributionTests.Apply(s, p.ProposalId, key)).StatusCode);
    }
    [Fact]
    public async Task MultiUndoRacesStaleInputsForeignOwnershipAndLatestGroupAreChecked()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, end: 660); var t = await s.Root(); await s.Define(t.Id, true, 21600); var p = await DistributionTests.Preview(s, t.Id); var accepted = await TaskScenario.Read<SchedulingApplyResult>(await DistributionTests.Apply(s, p.ProposalId));
        Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsJsonAsync("/api/scheduling/undo-multi-preview", new { changeSetId = accepted.ChangeSetId })).StatusCode);
        var a = await Preview(s, accepted.ChangeSetId!.Value); var b = await Preview(s, accepted.ChangeSetId.Value); var race = await Task.WhenAll(DistributionTests.Apply(s, a.ProposalId), DistributionTests.Apply(s, b.ProposalId)); Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync("/api/scheduling/undo-multi-preview", new { changeSetId = accepted.ChangeSetId })).StatusCode);
    }
}
