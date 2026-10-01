using System.Net;
using System.Net.Http.Json;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class WorkIntegrityTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task DatabaseRejectsOverlapAndForeignOwnerWhileTouchingSegmentsAreValid()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var a = await TaskScenario.User(app); var b = await TaskScenario.User(app); var t = await a.Root(); var u = await b.Root();
        var work = await WorkSessionTests.Started(a, t.Id); app.Clock.Now = app.Clock.Now.AddMinutes(10); work = await WorkSessionTests.Change(a, work, "finish");
        await using var db = fixture.CreateContext();
        db.WorkSegments.Add(new() { Id = Guid.CreateVersion7(), UserId = a.UserId, SessionId = work.Id, StartedAt = work.StartedAt.AddMinutes(2), EndedAt = work.EndedAt });
        var overlap = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ExclusionViolation, ((PostgresException)overlap.InnerException!).SqlState); db.ChangeTracker.Clear();
        db.WorkSegments.Add(new() { Id = Guid.CreateVersion7(), UserId = a.UserId, SessionId = work.Id, StartedAt = work.EndedAt!.Value, EndedAt = work.EndedAt.Value.AddMinutes(1) });
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        db.WorkSessions.Add(new() { Id = Guid.CreateVersion7(), UserId = a.UserId, TaskId = u.Id, StartedAt = app.Clock.Now });
        var owner = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)owner.InnerException!).SqlState); db.ChangeTracker.Clear();
        db.WorkSegments.Add(new() { Id = Guid.CreateVersion7(), UserId = b.UserId, SessionId = work.Id, StartedAt = app.Clock.Now });
        owner = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, ((PostgresException)owner.InnerException!).SqlState);
    }
    [Fact]
    public async Task DatabaseIndependentlyRejectsTwoRunningSessionsAndTwoOpenSegments()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var work = await WorkSessionTests.Started(s, a.Id);
        await using var db = fixture.CreateContext(); db.WorkSessions.Add(new() { Id = Guid.CreateVersion7(), UserId = s.UserId, TaskId = b.Id, StartedAt = app.Clock.Now });
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal(PostgresErrorCodes.UniqueViolation, ((PostgresException)duplicate.InnerException!).SqlState); db.ChangeTracker.Clear();
        db.WorkSegments.Add(new() { Id = Guid.CreateVersion7(), UserId = s.UserId, SessionId = work.Id, StartedAt = app.Clock.Now });
        var segment = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Contains(((PostgresException)segment.InnerException!).SqlState, new[] { PostgresErrorCodes.UniqueViolation, PostgresErrorCodes.ExclusionViolation });
    }
    [Fact]
    public async Task EventFailureRollsBackSessionSegmentTaskVersionAndIdempotencyTogether()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var task = await s.Root("Work rollback sentinel"); await using var db = fixture.CreateContext();
        var version = (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion;
        await db.Database.ExecuteSqlRawAsync("""
            CREATE FUNCTION reject_work_test() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN IF NEW."Type" IN ('WorkStarted','StateChanged') AND NEW."Payload"->'after'->>'Title' = 'Work rollback sentinel' THEN RAISE EXCEPTION 'test work failure'; END IF; RETURN NEW; END $$;
            CREATE TRIGGER reject_work_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_work_test();
            """);
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await WorkSessionTests.Start(s, task.Id, "rollback-key")).StatusCode); db.ChangeTracker.Clear();
            Assert.Equal(task.Version, (await s.Get(task.Id)).Version); Assert.Empty(await db.WorkSessions.Where(x => x.UserId == s.UserId).ToArrayAsync()); Assert.Empty(await db.WorkSegments.Where(x => x.UserId == s.UserId).ToArrayAsync());
            Assert.Empty(await db.IdempotencyRecords.Where(x => x.UserId == s.UserId).ToArrayAsync()); Assert.Equal(version, (await db.PlanningStates.SingleAsync(x => x.UserId == s.UserId)).PlanningVersion);
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE task_events DISABLE TRIGGER reject_work_test"); var work = await WorkSessionTests.Started(s, task.Id); await db.Database.ExecuteSqlRawAsync("ALTER TABLE task_events ENABLE TRIGGER reject_work_test");
            task = await s.Get(task.Id); app.Clock.Now = app.Clock.Now.AddMinutes(3);
            Assert.Equal(HttpStatusCode.InternalServerError, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" })).StatusCode);
            var current = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(WorkState.Running, current.State); Assert.Equal(work.Version, current.Version); Assert.Null(current.EndedAt); Assert.Equal(TaskState.InProgress, (await s.Get(task.Id)).State);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_work_test ON task_events; DROP FUNCTION reject_work_test();"); }
    }
    [Fact]
    public async Task CompleteVersusFinishRaceHasOneWinnerWithoutLosingActual()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var task = await s.Root(); var work = await WorkSessionTests.Started(s, task.Id); task = await s.Get(task.Id); app.Clock.Now = app.Clock.Now.AddMinutes(5);
        var race = await Task.WhenAll(s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/finish", new { version = work.Version }), s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" }));
        Assert.Single(race, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(race, x => x.StatusCode == HttpStatusCode.Conflict);
        var stored = await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{work.Id}")); Assert.Equal(WorkState.Finished, stored.State); Assert.Equal(300m, stored.ActiveSeconds);
        Assert.Null((await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession);
    }
    [Fact]
    public async Task ClockMovingBackwardDoesNotCreateNegativeTimeOrPartiallyCloseWork()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var task = await s.Root(); var work = await WorkSessionTests.Started(s, task.Id); var original = app.Clock.Now;
        app.Clock.Now = original.AddMinutes(-1); Assert.Equal(HttpStatusCode.Conflict, (await s.Client.GetAsync("/api/work-sessions/current")).StatusCode); Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/finish", new { version = work.Version })).StatusCode);
        task = await s.Get(task.Id); Assert.Equal(HttpStatusCode.Conflict, (await s.Client.PostAsJsonAsync($"/api/tasks/{task.Id}/state", new { version = task.Version, action = "Complete" })).StatusCode);
        app.Clock.Now = original.AddMinutes(1); var stillRunning = await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current")); Assert.Equal(60m, stillRunning.ActiveSession!.ActiveSeconds);
    }
    [Fact]
    public async Task OptionalChildKeepsRunningWhenRequiredSiblingCompletesParent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app); var root = await s.Root(); var required = await s.Child(root.Id); var optional = await s.Child(root.Id);
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync($"/api/tasks/{optional.Id}/required", new { version = optional.Version, requiredForParent = false })).StatusCode);
        var work = await WorkSessionTests.Started(s, optional.Id); await s.State(required.Id, TaskAction.Complete); Assert.Equal(TaskState.Completed, (await s.Get(root.Id)).State);
        Assert.Equal(work.Id, (await TaskScenario.Read<CurrentWork>(await s.Client.GetAsync("/api/work-sessions/current"))).ActiveSession!.Id);
    }
}
