using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Collections;
using Adhd.Application.Planning;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class UiR3PoolBatchTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private const string Path = "/api/calendar/days/2026-10-15/pool-batch";
    private static async Task<Guid> Pool(TaskScenario s) => (await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "Sakin havuz" }))).Id;
    private static async Task<DayItemView> Add(TaskScenario s, Guid task) => await TaskScenario.Read<DayItemView>(await s.Client.PostAsJsonAsync("/api/daily-plans/2026-10-15/items", new { taskId = task }));
    private static object Body(Guid pool, long version, params TaskView[] tasks) => new { poolId = pool, expectedPlanningVersion = version, tasks = tasks.Select(t => new { id = t.Id, version = t.Version }).ToArray() };
    private static Task<HttpResponseMessage> Undo(TaskScenario s, PlanMutation result) => s.Client.PostAsJsonAsync("/api/day-items/undo", new { changeSetId = result.ChangeSetId, expectedPlanningVersion = result.PlanningVersion });
    private static async Task<string?> Code(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [Fact]
    public async Task OneGroupRemovesUntimedAndFutureTimedWorkThenUndoRestoresIdentitiesPoolsAndHistory()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var a = await s.Root("Saatsiz"); var b = await s.Root("Saatli");
        await s.Define(a.Id, true, 3600); await s.Define(b.Id, true, 3600);
        var item = await Add(s, a.Id); var completed = await Add(s, b.Id);
        await s.Client.PostAsJsonAsync($"/api/day-items/{completed.Id}/complete", new { version = completed.Version });
        var allocation = await Create(s, b.Id, Morning.AddDays(1), Morning.AddDays(1).AddHours(1));
        var block = Assert.Single(allocation.Schedules); var baseline = (await Day(s, new(2026, 10, 16))).BaselineRevisionId;
        var completedBlock = Assert.Single((await Create(s, a.Id, Morning.AddDays(2), Morning.AddDays(2).AddMinutes(20))).Schedules);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PostAsJsonAsync($"/api/schedules/{completedBlock.Id}/complete", new { version = completedBlock.Version })).StatusCode);
        var actual = await Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = a.Id, startedAt = Morning.AddHours(-1), endedAt = Morning.AddMinutes(-50), reason = "Owned R3 history fixture" });
        Assert.Equal(HttpStatusCode.Created, actual.StatusCode);
        var pool = await Pool(s); var version = (await Day(s)).PlanningVersion;
        var originalTasks = new[] { await s.Get(a.Id), await s.Get(b.Id) };
        var body = Body(pool, version, originalTasks); var key = Guid.NewGuid().ToString();
        var response = await Send(s, HttpMethod.Post, Path, body, key); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await TaskScenario.Read<PlanMutation>(response);
        Assert.Equal(result.ChangeSetId, (await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, Path, Body(pool, version, originalTasks.Reverse().ToArray()), key))).ChangeSetId);
        Assert.Equal(version + 1, result.PlanningVersion); Assert.Equal(2, result.RevisionIds.Length);
        Assert.Equal(pool, (await s.Get(a.Id)).PoolId); Assert.Equal(pool, (await s.Get(b.Id)).PoolId);
        await using var db = fixture.CreateContext();
        Assert.Equal(DayItemState.Removed, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State);
        Assert.NotNull((await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == completed.Id)).CompletedAt);
        Assert.Equal(ScheduleState.Removed, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        var keptCompleted = await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == completedBlock.Id);
        Assert.Equal(ScheduleState.Planned, keptCompleted.State); Assert.NotNull(keptCompleted.CompletedAt);
        var undo = await Undo(s, result); Assert.Equal(HttpStatusCode.OK, undo.StatusCode);
        Assert.Null((await s.Get(a.Id)).PoolId); Assert.Null((await s.Get(b.Id)).PoolId);
        Assert.Equal(DayItemState.Planned, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State);
        Assert.Equal(ScheduleState.Planned, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.Equal(baseline, (await Day(s, new(2026, 10, 16))).BaselineRevisionId);
        Assert.Equal(result.ChangeSetId, (await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, Path, body, key))).ChangeSetId);
        Assert.Null((await s.Get(a.Id)).PoolId); // Tekrarda makbuzu döndür. Geri alınmış işi tekrar uygulama
        Assert.Equal(2, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId && x.Type == "ReturnedToPoolBatch"));
        Assert.Equal(2, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId && x.Type == "PoolReturnUndone"));
        Assert.Single(await db.WorkSessions.Where(x => x.UserId == s.UserId).ToArrayAsync());
        var segment = Assert.Single(await db.WorkSegments.Where(x => x.UserId == s.UserId).ToArrayAsync());
        Assert.Equal(600d, (segment.EndedAt!.Value - segment.StartedAt).TotalSeconds);
    }

    [Theory]
    [InlineData("stale", HttpStatusCode.Conflict)]
    [InlineData("foreignTask", HttpStatusCode.NotFound)]
    [InlineData("foreignPool", HttpStatusCode.NotFound)]
    [InlineData("running", HttpStatusCode.Conflict)]
    [InlineData("protected", HttpStatusCode.Conflict)]
    [InlineData("duplicate", HttpStatusCode.BadRequest)]
    public async Task EveryBoundaryRejectsTheWholeBatchWithoutChangingTheOtherTask(string boundary, HttpStatusCode status)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root();
        await s.Define(a.Id, true, 3600); await s.Define(b.Id, true, 3600);
        var item = await Add(s, a.Id); var pool = await Pool(s);
        if (boundary == "protected") await Create(s, b.Id, Morning.AddHours(1), Morning.AddHours(2), isFixed: true);
        if (boundary == "running") Assert.Equal(HttpStatusCode.Created, (await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = b.Id })).StatusCode);
        a = await s.Get(a.Id); b = await s.Get(b.Id);
        if (boundary is "foreignTask" or "foreignPool")
        {
            var foreign = await TaskScenario.User(app);
            if (boundary == "foreignTask") b = await foreign.Root(); else pool = await Pool(foreign);
        }
        if (boundary == "stale") b = b with { Version = b.Version - 1 };
        var version = (await Day(s)).PlanningVersion; var key = Guid.NewGuid().ToString();
        var response = await Send(s, HttpMethod.Post, Path, Body(pool, version, a, boundary == "duplicate" ? a : b), key);
        Assert.Equal(status, response.StatusCode); Assert.Null((await s.Get(a.Id)).PoolId); Assert.Equal(a.Version, (await s.Get(a.Id)).Version);
        await using var db = fixture.CreateContext();
        Assert.Equal(DayItemState.Planned, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State);
        Assert.Equal(version, (await Day(s)).PlanningVersion);
        Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        Assert.False(await db.TaskEvents.AnyAsync(x => x.UserId == s.UserId && x.Type == "ReturnedToPoolBatch"));
    }

    [Fact]
    public async Task SnapshotFailureRollsBackPoolsItemsEventsVersionAndReceiptAndOriginalKeyCanThenSucceed()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var task = await s.Root(); var item = await Add(s, task.Id); var pool = await Pool(s);
        var version = (await Day(s)).PlanningVersion; var body = Body(pool, version, await s.Get(task.Id)); var key = Guid.NewGuid().ToString();
        await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_pool_batch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Trigger\"='Pool' THEN RAISE EXCEPTION 'owned test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_pool_batch BEFORE INSERT ON plan_revisions FOR EACH ROW EXECUTE FUNCTION reject_pool_batch();");
        try { Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s, HttpMethod.Post, Path, body, key)).StatusCode); }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_pool_batch ON plan_revisions; DROP FUNCTION reject_pool_batch();"); }
        Assert.Null((await s.Get(task.Id)).PoolId); Assert.Equal(version, (await Day(s)).PlanningVersion);
        Assert.Equal(DayItemState.Planned, (await db.DayItems.AsNoTracking().SingleAsync(x => x.Id == item.Id)).State);
        Assert.False(await db.TaskEvents.AnyAsync(x => x.UserId == s.UserId && x.Type == "ReturnedToPoolBatch"));
        Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        Assert.Equal(HttpStatusCode.OK, (await Send(s, HttpMethod.Post, Path, body, key)).StatusCode);
    }

    [Fact]
    public async Task AnUndoThatWouldRestorePastTimeRollsBackEvenTheEarlierClassificationCompensation()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var task = await s.Root(); await s.Define(task.Id, true, 3600);
        var block = Assert.Single((await Create(s, task.Id, Morning.AddHours(1), Morning.AddHours(2))).Schedules);
        var pool = await Pool(s); var result = await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, Path, Body(pool, (await Day(s)).PlanningVersion, await s.Get(task.Id))));
        app.Clock.Now = Morning.AddHours(1).AddSeconds(1);
        var failed = await Undo(s, result); Assert.Equal(HttpStatusCode.Conflict, failed.StatusCode); Assert.Equal("undo_pool_time_passed", await Code(failed));
        Assert.Equal(pool, (await s.Get(task.Id)).PoolId); Assert.Equal(result.PlanningVersion, (await Day(s)).PlanningVersion);
        await using var db = fixture.CreateContext();
        Assert.Equal(ScheduleState.Removed, (await db.TaskSchedules.AsNoTracking().SingleAsync(x => x.Id == block.Id)).State);
        Assert.False(await db.TaskEvents.AnyAsync(x => x.UserId == s.UserId && x.Type == "PoolReturnUndone"));
    }

    [Fact]
    public async Task ClassificationOnlyHasARealRevisionAndCanUndoButAnyNewerUserChangeBlocksIt()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var task = await s.Root(); var pool = await Pool(s);
        var result = await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, Path, Body(pool, (await Day(s)).PlanningVersion, task)));
        Assert.Single(result.RevisionIds); Assert.Empty(result.Schedules);
        Assert.Equal(HttpStatusCode.OK, (await Undo(s, result)).StatusCode); Assert.Null((await s.Get(task.Id)).PoolId);
        result = await TaskScenario.Read<PlanMutation>(await Send(s, HttpMethod.Post, Path, Body(pool, (await Day(s)).PlanningVersion, await s.Get(task.Id))));
        await Add(s, task.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Undo(s, result)).StatusCode);
        Assert.Equal(pool, (await s.Get(task.Id)).PoolId);
    }
}
