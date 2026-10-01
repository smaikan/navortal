using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Work;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class MultiDayMoveTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static Task<HttpResponseMessage> Move(TaskScenario s, ScheduleView block, DateOnly target, DateTimeOffset start, long planningVersion, string? key = null, bool protect = false, bool conflicts = false) =>
        Send(s, HttpMethod.Post, $"/api/schedules/{block.Id}/move", new { block.Version, expectedPlanningVersion = planningVersion, targetDate = target, startsAt = start, endsAt = start + (block.EndsAt - block.StartsAt), allowProtectedChange = protect, allowConflicts = conflicts }, key);
    [Fact]
    public async Task MoveWritesBothDaysWithSameIdAndChangeSetAndKeepsOriginalWorkAndBaseline()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); await s.Define(t.Id, true, 7200); var made = await Create(s, t.Id, Morning.AddMinutes(30), Morning.AddHours(1)); var block = made.Schedules[0];
        var started = await TaskScenario.Read<WorkView>(await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = t.Id, scheduleId = block.Id, scheduleVersion = block.Version })); app.Clock.Now = Morning.AddMinutes(10); var paused = await WorkSessionTests.Change(s, started, "pause");
        var response = await Move(s, block, new(2026, 10, 16), Morning.AddDays(1), (await Day(s)).PlanningVersion); Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync()); var moved = await TaskScenario.Read<PlanMutation>(response); Assert.Equal(2, moved.RevisionIds.Length); var current = Assert.Single(moved.Schedules); Assert.Equal(block.Id, current.Id); Assert.Equal(t.Id, current.TaskId);
        var source = await Day(s); var target = await Day(s, new(2026, 10, 16)); Assert.Equal(made.RevisionIds[0], source.BaselineRevisionId); Assert.Equal(target.CurrentRevisionId, target.BaselineRevisionId); Assert.NotEqual(source.Id, current.DailyPlanId); Assert.Equal(target.Id, current.DailyPlanId);
        var a = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{source.CurrentRevisionId}")); var b = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{target.CurrentRevisionId}")); Assert.Equal(moved.ChangeSetId, a.ChangeSetId); Assert.Equal(a.ChangeSetId, b.ChangeSetId);
        Assert.Empty((await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{source.CurrentRevisionId}/items"))).Items); Assert.Equal(block.Id, Assert.Single((await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{target.CurrentRevisionId}/items"))).Items).Schedule.Id);
        Assert.Equal(block.DailyPlanId, Assert.Single((await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{made.RevisionIds[0]}/items"))).Items).Schedule.DailyPlanId);
        var change = Assert.Single((await TaskScenario.Read<RevisionChangePage>(await s.Client.GetAsync($"/api/plan-revisions/{source.CurrentRevisionId}/changes"))).Items); Assert.Equal("MovedOut", change.Type); Assert.Equal(source.Id, change.After!.DailyPlanId);
        var work = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{paused.Id}")); Assert.Equal(paused.ActiveSeconds, work.ActiveSeconds); Assert.Equal(started.StartedRevisionItemId, work.StartedRevisionItemId);
    }
    [Theory] [InlineData(true)] [InlineData(false)]
    public async Task ConcurrentMovesAndReplayCannotApplyHalfOrDuplicate(bool sameKey)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var made = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); var block = made.Schedules[0]; var version = (await Day(s)).PlanningVersion; var key = Guid.NewGuid().ToString();
        var race = await Task.WhenAll(Move(s, block, new(2026, 10, 17), Morning.AddDays(2), version, key), Move(s, block, new(2026, 10, 17), Morning.AddDays(2), version, sameKey ? key : null));
        if (sameKey) { Assert.All(race, x => Assert.Equal(HttpStatusCode.OK, x.StatusCode)); Assert.Equal((await TaskScenario.Read<PlanMutation>(race[0])).ChangeSetId, (await TaskScenario.Read<PlanMutation>(race[1])).ChangeSetId); }
        else { Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict); }
        Assert.Equal(HttpStatusCode.Conflict, (await Move(s, block, new(2026, 10, 18), Morning.AddDays(3), version, key)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.TaskSchedules.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(3, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task SecondDaySnapshotFailureRollsBackSourceTargetAndKey()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var made = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); var block = made.Schedules[0]; var before = await Day(s, new(2026, 10, 16)); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_move_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM plan_revisions r JOIN daily_plans p ON p.\"Id\"=r.\"DailyPlanId\" WHERE r.\"Id\"=NEW.\"RevisionId\" AND p.\"LocalDate\"='2026-10-17') THEN RAISE EXCEPTION 'test target snapshot failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_move_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_move_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Move(s, block, new(2026, 10, 17), Morning.AddDays(2), before.PlanningVersion, key)).StatusCode);
            Assert.Equal(before.CurrentRevisionId, (await Day(s, new(2026, 10, 16))).CurrentRevisionId); Assert.Null((await Day(s, new(2026, 10, 17))).Id); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion);
            Assert.Equal(block.DailyPlanId, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).DailyPlanId); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key)); Assert.Equal(1, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_move_test ON plan_revision_items; DROP FUNCTION reject_move_test();"); }
        Assert.Equal(HttpStatusCode.OK, (await Move(s, block, new(2026, 10, 17), Morning.AddDays(2), before.PlanningVersion, key)).StatusCode);
    }
    [Fact]
    public async Task PlanningAccountsForBusyBlocksOnAnotherFrozenLocalDay()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var busy = await Create(s, null, Morning.AddHours(15.5), Morning.AddHours(16.5), "Break", true); var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { prefs.Version, values = prefs.Values with { TimeZoneId = "UTC", Weekly = Enumerable.Range(0, 7).Select(d => new Adhd.Domain.Preferences.WeeklyWindow(d, 1260, 1440)).ToArray() } })).StatusCode);
        var t = await s.Root(); await s.Define(t.Id, true, 7200); var p = await SchedulingHttpTests.Preview(s, t.Id); Assert.False(p.HasConstraintConflicts); Assert.Equal(2, p.Blocks.Length); Assert.Equal(Morning.AddHours(15), p.Blocks[0].StartsAt); Assert.Equal(Morning.AddHours(15.5), p.Blocks[0].EndsAt); Assert.Equal(Morning.AddHours(16.5), p.Blocks[1].StartsAt); Assert.Equal(Morning.AddHours(18), p.Blocks[1].EndsAt);
        Assert.Equal(HttpStatusCode.OK, (await SchedulingHttpTests.Apply(s, p.ProposalId)).StatusCode); Assert.Equal(busy.Schedules[0].Id, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{busy.Schedules[0].Id}"))).Id);
    }
    [Fact]
    public async Task FrozenZonesAndForeignFixedActiveAndHistoricalGuardsArePreserved()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var t = await s.Root(); var made = await Create(s, t.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1), isFixed: true); var block = made.Schedules[0]; var version = (await Day(s)).PlanningVersion;
        Assert.Equal(HttpStatusCode.NotFound, (await Move(other, block, new(2026, 10, 17), Morning.AddDays(2), version)).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await Move(s, block, new(2026, 10, 17), Morning.AddDays(2), version)).StatusCode);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { prefs.Version, values = prefs.Values with { TimeZoneId = "UTC" } })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Move(s, block, new(2026, 10, 17), Morning.AddDays(2), (await Day(s)).PlanningVersion, protect: true)).StatusCode); Assert.Equal("Europe/Istanbul", (await Day(s, new(2026, 10, 16))).TimeZoneId); Assert.Equal("UTC", (await Day(s, new(2026, 10, 17))).TimeZoneId);
        var activeBlock = Assert.Single((await Create(s, t.Id, Morning.AddHours(1), Morning.AddHours(2))).Schedules); _ = await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = t.Id, scheduleId = activeBlock.Id, scheduleVersion = activeBlock.Version });
        Assert.Equal(HttpStatusCode.Conflict, (await Move(s, activeBlock, new(2026, 10, 18), Morning.AddDays(3), (await Day(s)).PlanningVersion)).StatusCode);
        var past = Assert.Single((await Create(s, null, Morning.AddMinutes(-30), Morning, "Break")).Schedules); Assert.Equal(HttpStatusCode.Conflict, (await Move(s, past, new(2026, 10, 18), Morning.AddDays(3), (await Day(s)).PlanningVersion)).StatusCode);
    }
}
