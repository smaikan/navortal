using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class ManualPlanningTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body, string? key = null)
    {
        var request = new HttpRequestMessage(method, path) { Content = JsonContent.Create(body) }; request.Headers.Add("Idempotency-Key", key ?? Guid.NewGuid().ToString()); return s.Client.SendAsync(request);
    }
    internal static async Task<DailyPlanView> Day(TaskScenario s, DateOnly? date = null) => await TaskScenario.Read<DailyPlanView>(await s.Client.GetAsync($"/api/daily-plans/{(date ?? new(2026, 10, 15)):yyyy-MM-dd}"));
    internal static async Task<PlanMutation> Create(TaskScenario s, Guid? task, DateTimeOffset start, DateTimeOffset end, string kind = "Work", bool isFixed = false, bool accept = false)
    {
        var day = await Day(s, PlanTime.Date(start, "Europe/Istanbul"));
        var response = await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = task, kind, startsAt = start, endsAt = end, isFixed, allowConflicts = accept, expectedPlanningVersion = day.PlanningVersion });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode); return await TaskScenario.Read<PlanMutation>(response);
    }
    internal static async Task<HttpResponseMessage> Change(TaskScenario s, ScheduleView block, bool remove = false, bool protect = false, DateTimeOffset? start = null, DateTimeOffset? end = null)
    {
        var day = await Day(s, PlanTime.Date(block.StartsAt, "Europe/Istanbul"));
        return await Send(s, remove ? HttpMethod.Post : HttpMethod.Put, $"/api/schedules/{block.Id}" + (remove ? "/remove" : ""), new { version = block.Version, expectedPlanningVersion = day.PlanningVersion,
            startsAt = start ?? block.StartsAt, endsAt = end ?? block.EndsAt, isFixed = block.IsFixed, isLocked = block.IsLocked, allowProtectedChange = protect });
    }
    internal static string Range(DateTimeOffset start, DateTimeOffset end) => $"from={Uri.EscapeDataString(start.ToString("O"))}&to={Uri.EscapeDataString(end.ToString("O"))}";
    [Fact]
    public async Task EmptyDayIsReadOnlyAndFirstWorkFreezesBaselineWithFullSnapshots()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var day = await Day(s); Assert.Null(day.Id); Assert.Equal(0, day.Version);
        await using var db = fixture.CreateContext(); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId));
        await Create(s, null, Morning, Morning.AddMinutes(15), "Break"); Assert.Null((await Day(s)).BaselineRevisionId);
        var task = await s.Root("Original task"); await s.Define(task.Id, true, 5400); var work = await Create(s, task.Id, Morning.AddMinutes(15), Morning.AddMinutes(75));
        Assert.Contains(work.Warnings, x => x.Code == "allocation_incomplete" && x.Seconds == 1800);
        day = await Day(s); Assert.Equal(2, day.Version); Assert.Equal(day.CurrentRevisionId, day.BaselineRevisionId);
        var baseline = day.BaselineRevisionId; var items = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{baseline}/items")); Assert.Equal(2, items.Total);
        task = await s.Get(task.Id); await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "New task" });
        await Create(s, task.Id, Morning.AddMinutes(75), Morning.AddMinutes(105)); day = await Day(s); Assert.Equal(3, day.Version); Assert.Equal(baseline, day.BaselineRevisionId);
        items = await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{baseline}/items")); Assert.Equal("Original task", Assert.Single(items.Items, x => x.Schedule.TaskId.HasValue).Schedule.TaskSnapshot!.Task.Title);
        Assert.Equal(0, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/time"))).SubtreeActualSeconds);
    }
    [Fact]
    public async Task CreateReplayDoesNotDuplicateRevisionAndStaleConcurrentIntentConflicts()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var day = await Day(s);
        var body = new { localDate = day.LocalDate, taskId = task.Id, kind = "Work", startsAt = Morning, endsAt = Morning.AddHours(1), expectedPlanningVersion = day.PlanningVersion }; var key = Guid.NewGuid().ToString();
        var race = await Task.WhenAll(Send(s, HttpMethod.Post, "/api/schedules", body, key), Send(s, HttpMethod.Post, "/api/schedules", body, key)); Assert.All(race, x => Assert.Equal(HttpStatusCode.Created, x.StatusCode));
        var a = await TaskScenario.Read<PlanMutation>(race[0]); var b = await TaskScenario.Read<PlanMutation>(race[1]); Assert.Equal(a.ChangeSetId, b.ChangeSetId); Assert.Equal(a.RevisionIds, b.RevisionIds);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/schedules", body)).StatusCode);
        var revisions = await TaskScenario.Read<RevisionPage>(await s.Client.GetAsync("/api/daily-plans/2026-10-15/revisions")); Assert.Equal(1, revisions.Total);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = task.Id, kind = "Work", startsAt = Morning, endsAt = Morning.AddHours(2), expectedPlanningVersion = day.PlanningVersion }, key)).StatusCode);
    }
    [Fact]
    public async Task FixedUpdateAndRemoveRequireExplicitIntentAndKeepHistoricalItems()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var created = await Create(s, task.Id, Morning, Morning.AddHours(1), isFixed: true); var block = Assert.Single(created.Schedules);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(s, block, start: Morning.AddHours(2), end: Morning.AddHours(3))).StatusCode);
        var moved = await Change(s, block, protect: true, start: Morning.AddHours(2), end: Morning.AddHours(3)); Assert.Equal(HttpStatusCode.OK, moved.StatusCode); block = Assert.Single((await TaskScenario.Read<PlanMutation>(moved)).Schedules);
        Assert.Equal(HttpStatusCode.Conflict, (await Change(s, block, remove: true)).StatusCode); var removed = await Change(s, block, remove: true, protect: true); Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var past = Assert.Single((await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{created.RevisionIds[0]}/items"))).Items); Assert.Equal(Morning, past.Schedule.StartsAt);
        Assert.Equal(ScheduleState.Removed, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{block.Id}"))).State);
        Assert.Empty((await TaskScenario.Read<SchedulePage>(await s.Client.GetAsync("/api/schedules?" + Range(Morning, Morning.AddDays(1))))).Items);
        var day = await Day(s); Assert.Equal(3, day.Version); Assert.Equal(created.RevisionIds[0], day.BaselineRevisionId);
    }
    [Fact]
    public async Task OverlapNeedsExplicitAcceptanceAndDoesNotBecomeActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var created = await Create(s, task.Id, Morning, Morning.AddHours(1)); var day = await Day(s);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = task.Id, kind = "Work", startsAt = Morning.AddMinutes(30), endsAt = Morning.AddMinutes(90), expectedPlanningVersion = day.PlanningVersion })).StatusCode);
        var accepted = await Create(s, task.Id, Morning.AddMinutes(30), Morning.AddMinutes(90), accept: true); Assert.Contains(accepted.Warnings, x => x.Code == "manual_overlap_accepted");
        var change = Assert.Single((await TaskScenario.Read<RevisionChangePage>(await s.Client.GetAsync($"/api/plan-revisions/{accepted.RevisionIds[0]}/changes"))).Items); Assert.True(change.ConflictsAccepted);
        Assert.Equal(2, (await TaskScenario.Read<RevisionItemPage>(await s.Client.GetAsync($"/api/plan-revisions/{accepted.RevisionIds[0]}/items"))).Total);
        Assert.NotEqual(created.ChangeSetId, accepted.ChangeSetId); Assert.Equal(0m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/time"))).DirectActualSeconds);
    }
    [Fact]
    public async Task PlannedStartRetainsItemWhenBlockMovesAndIsRemoved()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var created = await Create(s, task.Id, Morning, Morning.AddHours(1)); var block = Assert.Single(created.Schedules);
        var response = await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = task.Id, scheduleId = block.Id, scheduleVersion = block.Version }); Assert.Equal(HttpStatusCode.Created, response.StatusCode); var work = await TaskScenario.Read<WorkView>(response); Assert.Equal(block.Id, work.StartedScheduleId); Assert.NotNull(work.StartedRevisionItemId);
        var moved = await Change(s, block, start: Morning.AddHours(2), end: Morning.AddHours(3)); Assert.Equal(HttpStatusCode.OK, moved.StatusCode); block = Assert.Single((await TaskScenario.Read<PlanMutation>(moved)).Schedules); Assert.Equal(HttpStatusCode.OK, (await Change(s, block, remove: true)).StatusCode);
        app.Clock.Now = Morning.AddMinutes(20); var current = (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!;
        Assert.Equal(work.StartedRevisionItemId, current.StartedRevisionItemId); Assert.Equal(1200m, current.ActiveSeconds);
        await WorkSessionTests.Change(s, current, "finish"); await using var db = fixture.CreateContext(); Assert.True(await db.PlanRevisionItems.AnyAsync(x => x.Id == work.StartedRevisionItemId && x.RevisionId == created.RevisionIds[0]));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"DELETE FROM task_schedules WHERE \"Id\" = {block.Id}"));
    }
    [Theory] [InlineData(TaskAction.Complete)] [InlineData(TaskAction.Defer)] [InlineData(TaskAction.Skip)] [InlineData(TaskAction.Cancel)]
    public async Task LifecycleRevisesFutureAcrossDaysAndClosesActualAtSameInstant(TaskAction action)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var initial = await Create(s, task.Id, Morning, Morning.AddHours(1));
        var tomorrow = await Create(s, task.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1)); var work = await WorkSessionTests.Started(s, task.Id);
        app.Clock.Now = Morning.AddMinutes(20); await s.State(task.Id, action);
        var pastPart = await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{initial.Schedules[0].Id}")); Assert.Equal(app.Clock.Now, pastPart.EndsAt);
        var removed = await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{tomorrow.Schedules[0].Id}")); Assert.Equal(ScheduleState.Removed, removed.State);
        var a = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{(await Day(s)).CurrentRevisionId}")); var b = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{(await Day(s, new(2026, 10, 16))).CurrentRevisionId}")); Assert.Equal(a.ChangeSetId, b.ChangeSetId); Assert.Equal("TaskState", a.Trigger);
        Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).ActiveSeconds);
    }
    [Fact]
    public async Task OvernightAndPlanningFilterShareTaskIdentityAndKeepOriginalZone()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 5400); var start = Morning.AddHours(14.5);
        var created = await Create(s, task.Id, start, start.AddHours(1)); Assert.Equal(2, created.Schedules.Length); Assert.Equal(2, created.RevisionIds.Length);
        Assert.All(created.Schedules, x => { Assert.Equal(task.Id, x.TaskId); Assert.Equal(TimeSpan.FromMinutes(30), x.EndsAt - x.StartsAt); }); Assert.Equal(created.Schedules[0].SplitGroupId, created.Schedules[1].SplitGroupId); Assert.Equal(created.Schedules[0].Id, created.Schedules[1].OriginScheduleId);
        var range = Range(Morning, Morning.AddDays(2)); var planned = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?isPlanned=true&" + range)); Assert.Equal(task.Id, Assert.Single(planned.Items).Id);
        var allocation = await TaskScenario.Read<TaskAllocation>(await s.Client.GetAsync($"/api/tasks/{task.Id}/allocation?" + range)); Assert.Equal(3600m, allocation.AllocatedSeconds); Assert.Equal(1800m, allocation.UnallocatedSeconds); Assert.Equal(0m, allocation.DirectActualSeconds);
        var prefs = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { TimeZoneId = "UTC" } }); Assert.Equal("Europe/Istanbul", (await Day(s)).TimeZoneId);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/tasks?isPlanned=true")).StatusCode);
    }
    [Fact]
    public async Task ForeignNestedReadWriteAndTaskMismatchAreRejectedByHttpAndDatabase()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var task = await a.Root(); var other = await a.Root(); var made = await Create(a, task.Id, Morning, Morning.AddHours(1)); var block = made.Schedules[0];
        foreach (var path in new[] { $"/api/schedules/{block.Id}", $"/api/plan-revisions/{made.RevisionIds[0]}", $"/api/plan-revisions/{made.RevisionIds[0]}/items", $"/api/plan-revisions/{made.RevisionIds[0]}/changes", $"/api/tasks/{task.Id}/allocation?" + Range(Morning, Morning.AddDays(1)) }) Assert.Equal(HttpStatusCode.NotFound, (await b.Client.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Change(b, block)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(a, HttpMethod.Post, "/api/work-sessions/start", new { taskId = other.Id, scheduleId = block.Id, scheduleVersion = block.Version })).StatusCode);
        await using var db = fixture.CreateContext(); var item = await db.PlanRevisionItems.SingleAsync(x => x.UserId == a.UserId && x.ScheduleId == block.Id);
        db.WorkSessions.Add(new() { Id = Guid.CreateVersion7(), UserId = a.UserId, TaskId = other.Id, StartedAt = Morning, RecordedAt = Morning, StartedScheduleId = block.Id, StartedRevisionItemId = item.Id });
        var mismatch = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)mismatch.InnerException!).SqlState);
    }
    [Fact]
    public async Task SecondDaySnapshotFailureRollsBackEveryDayAndLifecycleFailureKeepsActualOpen()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_plan_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            IF EXISTS(SELECT 1 FROM plan_revisions r JOIN daily_plans p ON p."Id"=r."DailyPlanId" WHERE r."Id"=NEW."RevisionId" AND (p."LocalDate"='2026-10-16' OR r."Trigger"='TaskState')) THEN RAISE EXCEPTION 'test plan snapshot failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_plan_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_plan_test();
            """);
        try
        {
            var day = await Day(s); var start = Morning.AddHours(14.5);
            Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = task.Id, kind = "Work", startsAt = start, endsAt = start.AddHours(1), expectedPlanningVersion = day.PlanningVersion })).StatusCode);
            Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.TaskSchedules.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.PlanRevisions.AnyAsync(x => x.UserId == s.UserId)); Assert.Equal(day.PlanningVersion, (await Day(s)).PlanningVersion);
            var created = await Create(s, task.Id, Morning, Morning.AddHours(1)); var work = await WorkSessionTests.Started(s, task.Id); task = await s.Get(task.Id); app.Clock.Now = Morning.AddMinutes(20);
            Assert.Equal(HttpStatusCode.InternalServerError, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" })).StatusCode);
            Assert.Equal(task.Version, (await s.Get(task.Id)).Version); Assert.Equal(WorkState.Running, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).State);
            Assert.Equal(Morning.AddHours(1), (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{created.Schedules[0].Id}"))).EndsAt);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_plan_test ON plan_revision_items; DROP FUNCTION reject_plan_test();"); }
    }
    [Fact]
    public async Task DifferentConcurrentCreatesHaveOneWinnerAndCrossPlanCurrentPointerFailsInDatabase()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var day = await Day(s);
        var race = await Task.WhenAll(Enumerable.Range(0, 2).Select(i => Send(s, HttpMethod.Post, "/api/schedules", new { localDate = day.LocalDate, taskId = task.Id, kind = "Work", startsAt = Morning.AddHours(i), endsAt = Morning.AddHours(i + 1), expectedPlanningVersion = day.PlanningVersion })));
        Assert.Single(race, x => x.StatusCode == HttpStatusCode.Created); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        await Create(s, task.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1));
        await using var db = fixture.CreateContext(); var plans = await db.DailyPlans.Where(x => x.UserId == s.UserId).OrderBy(x => x.LocalDate).ToArrayAsync();
        plans[0].CurrentRevisionId = plans[1].CurrentRevisionId; var cross = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)cross.InnerException!).SqlState);
    }
    [Fact]
    public async Task ScheduledDirectWorkCannotDisappearAndArchiveRevisesOnlyItsOwnFuture()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var other = await s.Root();
        var planned = await Create(s, task.Id, Morning.AddHours(1), Morning.AddHours(2)); var kept = await Create(s, other.Id, Morning.AddHours(2), Morning.AddHours(3)); task = await s.Get(task.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}/work-definition", new { version = task.Version, hasDirectWork = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/children", new { title = "Child", parentVersion = task.Version })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/archive", new { version = task.Version })).StatusCode);
        Assert.Equal(ScheduleState.Removed, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{planned.Schedules[0].Id}"))).State);
        Assert.Equal(ScheduleState.Planned, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{kept.Schedules[0].Id}"))).State);
        var latest = await TaskScenario.Read<RevisionView>(await s.Client.GetAsync($"/api/plan-revisions/{(await Day(s)).CurrentRevisionId}")); Assert.Equal("TaskState", latest.Trigger);
    }
    [Fact]
    public async Task ParentOnlyAndDirectCompletionPreserveChildrenReservations()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var parent = await s.Root(); await s.Define(parent.Id, true, 600); var child = await s.Child(parent.Id);
        var own = await Create(s, parent.Id, Morning, Morning.AddMinutes(10)); var childs = await Create(s, child.Id, Morning.AddMinutes(10), Morning.AddMinutes(20)); var work = await WorkSessionTests.Started(s, parent.Id);
        app.Clock.Now = Morning.AddMinutes(5); await s.State(parent.Id, TaskAction.CompleteDirectWork); Assert.Equal(TaskState.Paused, (await s.Get(parent.Id)).State);
        Assert.Equal(app.Clock.Now, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{own.Schedules[0].Id}"))).EndsAt);
        await s.State(parent.Id, TaskAction.Complete, ParentCompletionChoice.ParentOnly);
        Assert.Equal(ScheduleState.Planned, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{childs.Schedules[0].Id}"))).State);
        Assert.Equal(300m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}"))).ActiveSeconds);
        await s.State(parent.Id, TaskAction.Complete, ParentCompletionChoice.CompleteSubtree);
        Assert.Equal(ScheduleState.Removed, (await TaskScenario.Read<ScheduleView>(await s.Client.GetAsync($"/api/schedules/{childs.Schedules[0].Id}"))).State);
    }
    [Fact]
    public async Task DeadlineIsIndependentOfBlockEndAndReadRangesAreBounded()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var task = await s.Root(); var deadline = Morning.AddMinutes(30);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = task.Title, deadlineAt = deadline })).StatusCode);
        var created = await Create(s, task.Id, Morning, Morning.AddHours(1)); Assert.Contains(created.Warnings, x => x.Code == "deadline_risk"); Assert.Equal(deadline, (await s.Get(task.Id)).DeadlineAt);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/schedules")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/schedules?limit=101&" + Range(Morning, Morning.AddDays(1)))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/schedules?" + Range(Morning, Morning.AddDays(367)))).StatusCode);
        var block = created.Schedules[0]; Assert.Equal(HttpStatusCode.Conflict, (await Change(s, block, start: Morning.AddDays(1), end: Morning.AddDays(1).AddHours(1))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = task.Id, scheduleId = block.Id })).StatusCode);
        var localRange = Range(Morning.ToOffset(TimeSpan.FromHours(3)), Morning.AddDays(1).ToOffset(TimeSpan.FromHours(3)));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.GetAsync("/api/schedules?" + localRange)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.GetAsync($"/api/tasks/{task.Id}/allocation?" + localRange)).StatusCode);
        Assert.Equal(task.Id, Assert.Single((await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?isPlanned=true&" + localRange))).Items).Id);
    }
}

