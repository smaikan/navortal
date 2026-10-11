using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class UiR3DeferralTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private const string Route = "/api/calendar/days/2026-10-15/defer";
    private static async Task<DayItemView> Item(TaskScenario s, Guid task, string date = "2026-10-15") => await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/daily-plans/{date}/items", new { taskId = task }));
    private static object Body(long planning, ScheduleView[] schedules, DayItemView[] items, bool protect = false) => new { targetDate = "2026-10-16", schedules = schedules.Select(x => new { id = x.Id, version = x.Version }).ToArray(), items = items.Select(x => new { id = x.Id, version = x.Version }).ToArray(), expectedPlanningVersion = planning, allowProtectedChange = protect };
    private static Task<HttpResponseMessage> Preview(TaskScenario s, object body) => s.Client.PostAsJsonAsync(Route + "-preview", body);
    private static Task<HttpResponseMessage> Undo(TaskScenario s, DayDeferralResult result) => s.Client.PostAsJsonAsync("/api/day-items/undo", new { changeSetId = result.ChangeSetId, expectedPlanningVersion = result.PlanningVersion });

    [Fact]
    public async Task MixedDeferralCancelsTimesDeduplicatesTasksPreservesExistingTargetAndUndoRestoresOneGroup()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var a = await s.Root("Saatli tahminsiz"); var b = await s.Root("Saatsiz"); var other = await s.Root("Hedef saat dolu");
        await s.Define(a.Id, true, null); await s.Define(b.Id, true, 600); await s.Define(other.Id, true, 600);
        var sourceItem = await Item(s, b.Id); var existing = await Item(s, b.Id, "2026-10-16");
        var one = Assert.Single((await Create(s, a.Id, Now.AddHours(1), Now.AddHours(1).AddMinutes(20))).Schedules);
        var two = Assert.Single((await Create(s, a.Id, Now.AddHours(2), Now.AddHours(2).AddMinutes(20))).Schedules);
        var occupied = Assert.Single((await Create(s, other.Id, Now.AddDays(1).AddHours(1), Now.AddDays(1).AddHours(2))).Schedules);
        Assert.Equal(HttpStatusCode.Created, (await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = a.Id, startedAt = Now.AddHours(-1), endedAt = Now.AddMinutes(-50), reason = "Owned immutable actual" })).StatusCode);
        var taskA = await s.Get(a.Id); var taskB = await s.Get(b.Id); var version = (await Day(s)).PlanningVersion;
        var body = Body(version, [one, two], [sourceItem]);
        await using var db = fixture.CreateContext(); var count = await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId);
        var preview = await TaskScenario.Read<DayDeferralPreview>(await Preview(s, body));
        Assert.True(preview.CanApply); Assert.Equal(2, preview.Tasks.Length); Assert.True(preview.Tasks.Single(x => x.TaskId == b.Id).AlreadyPlanned);
        Assert.Equal(count, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(version, (await Day(s)).PlanningVersion);
        Assert.False(await db.SchedulingProposals.AnyAsync(x => x.UserId == s.UserId));
        var key = Guid.NewGuid().ToString(); var result = await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, body, key));
        Assert.Equal(2, result.Items.Length); Assert.Equal(2, result.RevisionIds.Length); Assert.All(result.Schedules, x => Assert.Equal(ScheduleState.Removed, x.State));
        Assert.All(result.Items, x => Assert.Equal(new DateOnly(2026, 10, 16), x.LocalDate));
        Assert.Equal(existing.Id, result.Items.Single(x => x.TaskId == b.Id).Id); Assert.Equal(existing.Version, result.Items.Single(x => x.TaskId == b.Id).Version);
        Assert.Equal(taskA, await s.Get(a.Id)); Assert.Equal(taskB, await s.Get(b.Id)); Assert.Null((await s.Get(a.Id)).DirectEstimatedSeconds);
        Assert.Equal(1, (await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync("/api/daily-plans/2026-10-16/glance"))).UnknownEstimateCount);
        Assert.Equal(occupied.Version, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == occupied.Id)).Version);
        Assert.Equal(600d, (await db.WorkSegments.Where(x => x.UserId == s.UserId).Select(x => new { x.StartedAt, x.EndedAt }).SingleAsync()).EndedAt!.Value.Subtract(Now.AddHours(-1)).TotalSeconds);
        Assert.Equal(result.ChangeSetId, (await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, Body(version, [two, one], [sourceItem]), key))).ChangeSetId);
        Assert.Equal(HttpStatusCode.OK, (await Undo(s, result)).StatusCode);
        var restored = await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == one.Id); Assert.Equal(ScheduleState.Planned, restored.State); Assert.Equal(one.StartsAt, restored.StartsAt); Assert.Equal(one.EndsAt, restored.EndsAt);
        Assert.Equal(DayItemState.Planned, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == sourceItem.Id)).State);
        Assert.Equal(existing.Version, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == existing.Id)).Version);
        var addedItemId = result.Items.Single(y => y.TaskId == a.Id).Id;
        Assert.Equal(DayItemState.Removed, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == addedItemId)).State);
        Assert.Equal(result.ChangeSetId, (await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, body, key))).ChangeSetId);
        Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == one.Id)).State);
    }

    [Theory]
    [InlineData("planning", HttpStatusCode.Conflict)]
    [InlineData("schedule", HttpStatusCode.Conflict)]
    [InlineData("item", HttpStatusCode.Conflict)]
    [InlineData("foreign", HttpStatusCode.NotFound)]
    [InlineData("day", HttpStatusCode.BadRequest)]
    [InlineData("completed", HttpStatusCode.Conflict)]
    [InlineData("running", HttpStatusCode.Conflict)]
    [InlineData("protected", HttpStatusCode.Conflict)]
    [InlineData("targetCompleted", HttpStatusCode.Conflict)]
    [InlineData("duplicate", HttpStatusCode.BadRequest)]
    [InlineData("empty", HttpStatusCode.BadRequest)]
    public async Task BoundaryNeverPartiallyCancelsTheOtherSelection(string boundary, HttpStatusCode status)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); await s.Define(a.Id, true, 3600); await s.Define(b.Id, true, 600);
        var item = await Item(s, b.Id);
        var block = Assert.Single((await Create(s, a.Id, Now.AddDays(boundary == "day" ? 1 : 0).AddHours(1), Now.AddDays(boundary == "day" ? 1 : 0).AddHours(2), isFixed: boundary == "protected")).Schedules);
        if (boundary == "item") item = await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync($"/api/day-items/{item.Id}/reopen", new { version = item.Version }));
        if (boundary == "schedule")
        {
            block = Assert.Single((await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete", new { version = block.Version }))).Schedules);
            block = Assert.Single((await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/reopen", new { version = block.Version }))).Schedules);
        }
        if (boundary == "completed") block = Assert.Single((await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete", new { version = block.Version }))).Schedules);
        if (boundary == "running") Assert.Equal(HttpStatusCode.Created, (await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = a.Id })).StatusCode);
        if (boundary == "targetCompleted") { var target = await Item(s, b.Id, "2026-10-16"); Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/day-items/{target.Id}/complete", new { version = target.Version })).StatusCode); }
        var foreignBlock = block;
        if (boundary == "foreign") { var foreign = await TaskScenario.User(app); var task = await foreign.Root(); await foreign.Define(task.Id, true, 600); foreignBlock = Assert.Single((await Create(foreign, task.Id, Now.AddHours(3), Now.AddHours(4))).Schedules); }
        var version = (await Day(s)).PlanningVersion; var before = await s.Get(a.Id);
        var selected = boundary == "schedule" ? block with { Version = block.Version - 1 } : foreignBlock;
        var body = Body(boundary == "planning" ? version - 1 : version, boundary == "empty" ? [] : boundary == "duplicate" ? [selected, selected] : [selected], boundary == "empty" ? [] : [boundary == "item" ? item with { Version = item.Version - 1 } : item]);
        var preview = await Preview(s, body);
        if (boundary is "running" or "protected" or "targetCompleted") Assert.False((await TaskScenario.Read<DayDeferralPreview>(preview)).CanApply); else Assert.Equal(status, preview.StatusCode);
        var key = Guid.NewGuid().ToString(); Assert.Equal(status, (await Send(s, HttpMethod.Post, Route, body, key)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.Equal(DayItemState.Planned, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State); Assert.Equal(before, await s.Get(a.Id));
        Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
    }

    [Fact]
    public async Task AnEarlierAssignedHourCanBecomeUntimedAndItsUndoIsANewRevisionWithoutChangingActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 600);
        var block = Assert.Single((await Create(s, task.Id, Now.AddHours(-1), Now.AddMinutes(-30))).Schedules);
        var before = await Day(s); var body = Body(before.PlanningVersion, [block], []);
        var result = await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, body));
        Assert.Single(result.Items); Assert.Equal(HttpStatusCode.OK, (await Undo(s, result)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.True(await db.PlanRevisions.AnyAsync(x => x.Id == before.CurrentRevisionId)); Assert.False(await db.WorkSessions.AnyAsync(x => x.UserId == s.UserId));
        Assert.Equal(2, await db.PlanRevisions.CountAsync(x => x.UserId == s.UserId && x.ReversesChangeSetId == result.ChangeSetId));
    }

    [Fact]
    public async Task SqlFailureRollsBackBothKindsAndReceiptThenOriginalKeyCanSucceed()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 1200);
        var block = Assert.Single((await Create(s, task.Id, Now.AddHours(1), Now.AddHours(2))).Schedules); var item = await Item(s, task.Id);
        var body = Body((await Day(s)).PlanningVersion, [block], [item]); var key = Guid.NewGuid().ToString();
        await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_defer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Trigger\"='Defer' THEN RAISE EXCEPTION 'owned failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_defer BEFORE INSERT ON plan_revisions FOR EACH ROW EXECUTE FUNCTION reject_defer();");
        try { Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s, HttpMethod.Post, Route, body, key)).StatusCode); }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_defer ON plan_revisions; DROP FUNCTION reject_defer();"); }
        Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.Equal(new DateOnly(2026, 10, 15), (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).LocalDate);
        Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId && x.LocalDate == new DateOnly(2026, 10, 16)));
        Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        Assert.Equal(HttpStatusCode.OK, (await Send(s, HttpMethod.Post, Route, body, key)).StatusCode);
    }

    [Fact]
    public async Task CompletionAfterPreviewCannotBeSilentlyOverwrittenAndUndoCannotRemoveALaterTimeAssignment()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 1200);
        var block = Assert.Single((await Create(s, task.Id, Now.AddHours(1), Now.AddHours(2))).Schedules); var body = Body((await Day(s)).PlanningVersion, [block], []);
        Assert.True((await TaskScenario.Read<DayDeferralPreview>(await Preview(s, body))).CanApply);
        block = Assert.Single((await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/complete", new { version = block.Version }))).Schedules);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, Route, body)).StatusCode);
        block = Assert.Single((await TaskScenario.Read<ScheduleCompletion>(await s.Client.PostAsJsonAsync($"/api/schedules/{block.Id}/reopen", new { version = block.Version }))).Schedules);
        var result = await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, Body((await Day(s)).PlanningVersion, [block], [])));
        var item = Assert.Single(result.Items); var version = (await Day(s, new(2026, 10, 16))).PlanningVersion;
        var assigned = await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = "2026-10-16", taskId = task.Id, kind = "Work", startsAt = Now.AddDays(1).AddHours(3), endsAt = Now.AddDays(1).AddHours(4), expectedPlanningVersion = version, dayItemId = item.Id, dayItemVersion = item.Version });
        Assert.Equal(HttpStatusCode.Created, assigned.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Undo(s, result)).StatusCode);
        await using var db = fixture.CreateContext(); Assert.Equal(DayItemState.Scheduled, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State);
        Assert.Equal(ScheduleState.Removed, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
    }
    [Fact]
    public async Task ExplicitProtectedConsentWorksAndFailedUndoRollsBackEveryRestoration()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Now;
        var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 1200);
        var block = Assert.Single((await Create(s, task.Id, Now.AddHours(1), Now.AddHours(2), isFixed: true)).Schedules);
        var item = await Item(s, task.Id); var body = Body((await Day(s)).PlanningVersion, [block], [item], true);
        Assert.True((await TaskScenario.Read<DayDeferralPreview>(await Preview(s, body))).CanApply);
        var result = await TaskScenario.Read<DayDeferralResult>(await Send(s, HttpMethod.Post, Route, body));
        await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_defer_undo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Trigger\"='Defer' AND NEW.\"ReversesChangeSetId\" IS NOT NULL THEN RAISE EXCEPTION 'owned undo failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_defer_undo BEFORE INSERT ON plan_revisions FOR EACH ROW EXECUTE FUNCTION reject_defer_undo();");
        try { Assert.Equal(HttpStatusCode.InternalServerError, (await Undo(s, result)).StatusCode); }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_defer_undo ON plan_revisions; DROP FUNCTION reject_defer_undo();"); }
        Assert.Equal(ScheduleState.Removed, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.Equal(new DateOnly(2026, 10, 16), (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).LocalDate);
        Assert.Equal(result.PlanningVersion, (await Day(s)).PlanningVersion);
        Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId && x.ReversesChangeSetId == result.ChangeSetId));
        Assert.Equal(HttpStatusCode.OK, (await Undo(s, result)).StatusCode);
        Assert.True((await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).IsFixed);
    }

}
