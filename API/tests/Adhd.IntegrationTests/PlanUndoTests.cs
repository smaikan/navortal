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

public sealed class PlanUndoTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static Task<HttpResponseMessage> Undo(TaskScenario s, Guid group, bool protect = false) => s.Client.PostAsJsonAsync("/api/scheduling/undo-preview", new { changeSetId = group, allowProtectedChange = protect });
    private static async Task<SchedulingPreviewView> Preview(TaskScenario s, Guid group, bool protect = false)
    {
        var r = await Undo(s, group, protect); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<SchedulingPreviewView>(r);
    }
    [Fact]
    public async Task UndoMoveCreatesCompensationAndPreservesOriginalRevisionsAndBaseline()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 3600);
        var original = await Create(s, t.Id, Morning.AddMinutes(30), Morning.AddMinutes(60)); var block = original.Schedules[0]; var changed = await TaskScenario.Read<PlanMutation>(await Change(s, block, start: Morning.AddMinutes(90), end: Morning.AddMinutes(120)));
        var before = await Day(s); var p = await Preview(s, changed.ChangeSetId); Assert.Equal("undo-v1", p.AlgorithmVersion); Assert.False(p.IsPartial); Assert.Equal(changed.ChangeSetId, p.ReversesChangeSetId); Assert.Equal(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId);
        var r = await SchedulingHttpTests.Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(r); Assert.Single(effect.RevisionIds); Assert.False(effect.NoChanges);
        var current = await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{block.Id}")); Assert.Equal(block.StartsAt, current.StartsAt); Assert.Equal(3, current.Version);
        var revision = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{effect.RevisionIds[0]}")); Assert.Equal("Undo", revision.Trigger); Assert.Equal(changed.ChangeSetId, revision.ReversesChangeSetId); Assert.Equal(before.CurrentRevisionId, revision.PreviousRevisionId); Assert.Equal(original.RevisionIds[0], (await Day(s)).BaselineRevisionId);
        Assert.Equal(Morning.AddMinutes(90), Assert.Single((await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{changed.RevisionIds[0]}/items"))).Items).Schedule.StartsAt);
        Assert.Equal(HttpStatusCode.Conflict, (await Undo(s, changed.ChangeSetId)).StatusCode);
    }
    [Fact]
    public async Task RemovedScheduleRestoresSameIdentityAndOriginalWorkContextSurvives()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root("Original title"); await s.Define(t.Id, true, 3600);
        var created = await Create(s, t.Id, Morning.AddMinutes(30), Morning.AddMinutes(60)); var block = created.Schedules[0]; var started = await TaskScenario.Read<WorkView>(await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = t.Id, scheduleId = block.Id, scheduleVersion = block.Version }));
        app.Clock.Now = Morning.AddMinutes(10); var finished = await WorkSessionTests.Change(s, started, "finish"); var removed = await TaskScenario.Read<PlanMutation>(await Change(s, block, remove: true));
        var p = await Preview(s, removed.ChangeSetId); Assert.Equal("Restored", Assert.Single(p.Changes).Type); var response = await SchedulingHttpTests.Apply(s, p.ProposalId); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync());
        var restored = await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{block.Id}")); Assert.Equal(ScheduleState.Planned, restored.State); Assert.Equal("Original title", restored.TaskSnapshot!.Task.Title);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{started.Id}")); Assert.Equal(finished.ActiveSeconds, work.ActiveSeconds); Assert.Equal(started.StartedRevisionItemId, work.StartedRevisionItemId); Assert.Equal(TaskState.Paused, (await s.Get(t.Id)).State);
    }
    [Fact]
    public async Task CompletedTaskAndActualNeverReopenAndPartialNoOpCanBeAcknowledgedOnce()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 3600); var plan = await Create(s, t.Id, Morning.AddMinutes(30), Morning.AddMinutes(60)); var work = await WorkSessionTests.Started(s, t.Id); app.Clock.Now = Morning.AddMinutes(20); await s.State(t.Id, TaskAction.Complete);
        var completed = await s.Get(t.Id); var before = await Day(s); var p = await Preview(s, plan.ChangeSetId); Assert.True(p.IsPartial); Assert.Empty(p.Changes); Assert.NotEmpty(p.Warnings);
        var r = await SchedulingHttpTests.Apply(s, p.ProposalId); Assert.True(r.StatusCode == HttpStatusCode.OK, await r.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(r); Assert.True(effect.NoChanges); Assert.Equal(before.PlanningVersion, effect.PlanningVersion);
        Assert.Equal(completed.Version, (await s.Get(t.Id)).Version); Assert.Equal(TaskState.Completed, (await s.Get(t.Id)).State); Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).ActiveSeconds);
        Assert.Equal(HttpStatusCode.Conflict, (await Undo(s, plan.ChangeSetId)).StatusCode); Assert.Equal(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId);
    }
    [Fact]
    public async Task PartialCompensationRemovesOnlyOpenFutureWorkAndKeepsCompletedActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var a = await s.Root(); await s.Define(a.Id, true, 1800); var b = await s.Root(); await s.Define(b.Id, true, 1800);
        var generated = await SchedulingHttpTests.Preview(s, a.Id, b.Id); var accepted = await TaskScenario.Read<SchedulingApplyResult>(await SchedulingHttpTests.Apply(s, generated.ProposalId)); var work = await WorkSessionTests.Started(s, a.Id); app.Clock.Now = Morning.AddMinutes(20); await s.State(a.Id, TaskAction.Complete);
        var completed = await s.Get(a.Id); var p = await Preview(s, accepted.ChangeSetId!.Value); Assert.True(p.IsPartial); Assert.Contains(p.Changes, x => x.TaskId == b.Id && x.Type == "Removed"); Assert.DoesNotContain(p.Changes, x => x.TaskId == a.Id);
        var response = await SchedulingHttpTests.Apply(s, p.ProposalId); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync()); var effect = await TaskScenario.Read<SchedulingApplyResult>(response); Assert.False(effect.NoChanges); Assert.Single(effect.RevisionIds);
        Assert.Equal(completed.Version, (await s.Get(a.Id)).Version); Assert.Equal(TaskState.Completed, (await s.Get(a.Id)).State); Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).ActiveSeconds);
    }
    [Fact]
    public async Task ActualStartBetweenSourceAndUndoIsProtectedAndStalePreviewConflicts()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 3600); var made = await Create(s, t.Id, Morning, Morning.AddHours(1)); var stale = await Preview(s, made.ChangeSetId);
        var work = await TaskScenario.Read<WorkView>(await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = t.Id, scheduleId = made.Schedules[0].Id, scheduleVersion = made.Schedules[0].Version }));
        Assert.Equal(HttpStatusCode.Conflict, (await SchedulingHttpTests.Apply(s, stale.ProposalId)).StatusCode); app.Clock.Now = Morning.AddMinutes(20);
        var fresh = await Preview(s, made.ChangeSetId); Assert.True(fresh.IsPartial); Assert.Contains(fresh.Warnings, x => x.Code == "UndoActiveWorkProtected"); Assert.Empty(fresh.Changes); Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(s, fresh.ProposalId)).StatusCode);
        Assert.Equal(work.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
    [Fact]
    public async Task AcceptedProposalReceiptCanReplayAfterInputSchemaChanges()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var made = await Create(s, null, Morning.AddHours(1), Morning.AddHours(2), "Break"); var p = await Preview(s, made.ChangeSetId);
        var first = await TaskScenario.Read<SchedulingApplyResult>(await SchedulingHttpTests.Apply(s, p.ProposalId));
        await using var db = fixture.CreateContext(); await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE scheduling_proposals SET \"Input\"=\"Input\"-'undo' WHERE \"Id\"={p.ProposalId}");
        var r = await SchedulingHttpTests.Apply(s, p.ProposalId); Assert.Equal(HttpStatusCode.OK, r.StatusCode); Assert.Equal(first.ChangeSetId, (await TaskScenario.Read<SchedulingApplyResult>(r)).ChangeSetId);
    }
    [Fact]
    public async Task UndoApplyRacesAndPayloadKeysHaveOneEffect()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var made = await Create(s, t.Id, Morning.AddHours(1), Morning.AddHours(2)); var a = await Preview(s, made.ChangeSetId); var b = await Preview(s, made.ChangeSetId); var key = Guid.NewGuid().ToString();
        var races = await Task.WhenAll(SchedulingHttpTests.Apply(s, a.ProposalId, key), SchedulingHttpTests.Apply(s, a.ProposalId, key)); Assert.All(races, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode));
        var first = await TaskScenario.Read<SchedulingApplyResult>(races[0]); var replay = await TaskScenario.Read<SchedulingApplyResult>(races[1]); Assert.Equal(first.ChangeSetId, replay.ChangeSetId); Assert.Equal(HttpStatusCode.Conflict, (await SchedulingHttpTests.Apply(s, b.ProposalId, key)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await SchedulingHttpTests.Apply(s, b.ProposalId)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(2, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(1, await db.SchedulingProposals.CountAsync(x => x.UserId == s.UserId && x.Status == "Applied" && x.ReversesChangeSetId == made.ChangeSetId));
    }
    [Fact]
    public async Task SnapshotFailureRollsBackCompensationAndRetrySucceeds()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await Create(s, null, Morning.AddHours(2), Morning.AddHours(2.5), "Break"); var t = await s.Root(); var made = await Create(s, t.Id, Morning.AddHours(1), Morning.AddHours(1.5)); var p = await Preview(s, made.ChangeSetId); var before = await Day(s); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_undo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test undo failure'; END $$; CREATE TRIGGER reject_undo_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_undo_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await SchedulingHttpTests.Apply(s, p.ProposalId, key)).StatusCode); Assert.Equal(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion); Assert.Equal("Pending", (await db.SchedulingProposals.AsNoTracking().SingleAsync(x => x.Id == p.ProposalId)).Status);
            Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == made.Schedules[0].Id)).State); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_undo_test ON plan_revision_items; DROP FUNCTION reject_undo_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(s, p.ProposalId, key)).StatusCode);
    }
    [Fact]
    public async Task FixedIntentForeignSourceAndLatestUserChangeAreValidated()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var t = await a.Root(); var made = await Create(a, t.Id, Morning.AddHours(1), Morning.AddHours(2), isFixed: true);
        Assert.Equal(HttpStatusCode.NotFound, (await Undo(b, made.ChangeSetId)).StatusCode); var blocked = await Preview(a, made.ChangeSetId); Assert.True(blocked.IsPartial); Assert.Contains(blocked.Warnings, x => x.Code == "UndoProtectedIntentRequired"); Assert.Empty(blocked.Changes);
        var allowed = await Preview(a, made.ChangeSetId, true); Assert.False(allowed.IsPartial); Assert.Single(allowed.Changes); Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(a, allowed.ProposalId)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Undo(a, made.ChangeSetId)).StatusCode);
    }
    [Fact]
    public async Task BreakOnlyDayCanUndoWithoutCreatingSyntheticTask()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var made = await Create(s, null, Morning.AddHours(1), Morning.AddHours(2), "Break"); var p = await Preview(s, made.ChangeSetId);
        Assert.Single(p.Changes); Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(s, p.ProposalId)).StatusCode); await using var db = fixture.CreateContext(); Assert.False(await db.Tasks.AnyAsync(x => x.UserId == s.UserId)); Assert.Null((await Day(s)).BaselineRevisionId);
    }
    [Fact]
    public async Task UpdatedSettingsMakeRestorePartialAndLaterInputMakesThatPreviewStale()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var t = await s.Root(); await s.Define(t.Id, true, 3600); var made = await Create(s, t.Id, Morning.AddHours(1), Morning.AddHours(2)); var removed = await TaskScenario.Read<PlanMutation>(await Change(s, made.Schedules[0], remove: true));
        await s.Define(t.Id, true, 600); var p = await Preview(s, removed.ChangeSetId); Assert.True(p.IsPartial); Assert.Contains(p.Warnings, x => x.Code == "UndoQuantityExceeded"); Assert.Empty(p.Changes);
        await s.Define(t.Id, true, 7200); Assert.Equal(HttpStatusCode.Conflict, (await SchedulingHttpTests.Apply(s, p.ProposalId)).StatusCode); var feasible = await Preview(s, removed.ChangeSetId); Assert.False(feasible.IsPartial); Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(s, feasible.ProposalId)).StatusCode);
    }
}
