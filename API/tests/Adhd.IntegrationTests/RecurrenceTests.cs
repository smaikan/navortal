using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Focus;
using Adhd.Application.Recurrence;
using Adhd.Application.Work;
using Adhd.Domain.Focus;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class RecurrenceTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body, string? key = null) => ManualPlanningTests.Send(s, method, path, JsonSerializer.SerializeToElement(body, Json), key);
    private static async Task<T> Ok<T>(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { Assert.True(r.StatusCode == status, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<T>(r); }
    private static async Task<RecurrenceTemplateView> Create(TaskScenario s, RecurrenceRule? rule = null, string title = "Tekrar", long? seconds = 3600)
    {
        return (await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, "/api/recurrence-templates", new RecurrenceCreate(rule ?? new(Today), new(title, EstimatedSeconds: seconds))), HttpStatusCode.Created)).Template;
    }
    private static Task<HttpResponseMessage> Generate(TaskScenario s, RecurrenceTemplateView t, DateOnly? from = null, DateOnly? to = null, string? key = null) => Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/materialize", new MaterializeRecurrence(t.Version, from ?? Today, to ?? Today.AddDays(2)), key);
    private static Task<HttpResponseMessage> Update(TaskScenario s, RecurrenceTemplateView t, DateOnly from, RecurrenceRule rule, string title, bool refresh = false, DateOnly? through = null, string? key = null) => Send(s, HttpMethod.Put, $"/api/recurrence-templates/{t.Id}", new RecurrenceUpdate(t.Version, from, rule, new(title, EstimatedSeconds: 1800), refresh, through), key);
    [Fact]
    public async Task RepeatedAndParallelOverlappingWindowsCreateExactlyOneTaskPerLocalOccurrence()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s); var key = Guid.NewGuid().ToString();
        var race = await Task.WhenAll(Generate(s, t, key: key), Generate(s, t, key: key)); var a = await Ok<RecurrenceEffect>(race[0]); var b = await Ok<RecurrenceEffect>(race[1]); Assert.Equal(a.Occurrences.Select(x => x.TaskId), b.Occurrences.Select(x => x.TaskId)); Assert.Equal(3, a.Occurrences.Length);
        var version = a.PlanningVersion; var again = await Ok<RecurrenceEffect>(await Generate(s, t)); Assert.Equal(version, again.PlanningVersion); Assert.Equal(a.Occurrences.Select(x => x.Id), again.Occurrences.Select(x => x.Id));
        var overlaps = await Task.WhenAll(Generate(s, t, Today.AddDays(1), Today.AddDays(3)), Generate(s, t, Today.AddDays(2), Today.AddDays(4))); foreach (var r in overlaps) await Ok<RecurrenceEffect>(r);
        await using var db = fixture.CreateContext(); Assert.Equal(5, await db.RecurrenceOccurrences.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(5, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task FutureRefreshPreservesPastCompletedManualPlannedAndSubdividedTasksButUpdatesUntouchedIdentity()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s); var generated = await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today.AddDays(5))); var rows = generated.Occurrences;
        app.Clock.Now = Morning.AddDays(1); await s.State(rows[1].TaskId!.Value, TaskAction.Complete);
        var manual = await s.Get(rows[2].TaskId!.Value); await s.Client.PutAsJsonAsync($"/api/tasks/{manual.Id}", new { version = manual.Version, title = "Ben düzenledim" });
        await ManualPlanningTests.Create(s, rows[3].TaskId, Morning.AddDays(3), Morning.AddDays(3).AddHours(1)); await s.Child(rows[5].TaskId!.Value, "Alt iş");
        var changed = await Ok<RecurrenceEffect>(await Update(s, t, Today.AddDays(1), new(Today, Frequency: RecurrenceFrequency.IntervalDays, Interval: 2), "Yeni seri", true, Today.AddDays(5)));
        Assert.Equal(new[] { rows[4].TaskId!.Value }, changed.RefreshedTaskIds); Assert.Equal(4, changed.ProtectedTaskIds.Length); Assert.Equal("Tekrar", (await s.Get(rows[0].TaskId!.Value)).Title); Assert.Equal(TaskState.Completed, (await s.Get(rows[1].TaskId!.Value)).State); Assert.Equal("Ben düzenledim", (await s.Get(manual.Id)).Title);
        var refreshed = await s.Get(rows[4].TaskId!.Value); Assert.Equal("Yeni seri", refreshed.Title); Assert.Equal(1800, refreshed.DirectEstimatedSeconds); var source = await Ok<OccurrenceView>(await s.Client.GetAsync($"/api/tasks/{refreshed.Id}/recurrence")); Assert.Equal(t.DefinitionId, source.OriginalDefinitionId); Assert.Equal(changed.Template.DefinitionId, source.AppliedDefinitionId); Assert.False(source.TaskChangedSinceSync);
        var next = await Ok<RecurrenceEffect>(await Generate(s, changed.Template, Today.AddDays(6), Today.AddDays(6))); Assert.Equal("Yeni seri", (await s.Get(Assert.Single(next.Occurrences).TaskId!.Value)).Title);
        var definitions = await Ok<RecurrenceDefinitionPage>(await s.Client.GetAsync($"/api/recurrence-templates/{t.Id}/definitions")); Assert.Equal(2, definitions.Total); Assert.Equal("Tekrar", definitions.Items[1].Task.Title);
    }
    [Fact]
    public async Task ChangingRuleSkipsUntouchedFutureTasksAndMarkersNeverRegenerateCopies()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s); var first = await Ok<RecurrenceEffect>(await Generate(s, t));
        var update = await Ok<RecurrenceEffect>(await Update(s, t, Today, new(Today, Frequency: RecurrenceFrequency.IntervalDays, Interval: 2), "İki günde bir", true, Today.AddDays(2)));
        var skipped = Assert.Single(update.Occurrences, x => x.LocalDate == Today.AddDays(1)); Assert.Equal(OccurrenceState.Skipped, skipped.State); Assert.Equal(TaskState.Skipped, skipped.TaskState); Assert.Equal(first.Occurrences[1].TaskId, skipped.TaskId);
        await Ok<RecurrenceEffect>(await Generate(s, update.Template)); await using var db = fixture.CreateContext(); Assert.Equal(3, await db.Tasks.CountAsync(x => x.UserId == s.UserId));
    }
    [Fact]
    public async Task ExplicitUnmaterializedSkipCancelAndSingleTaskEditDoNotChangeOtherInstancesOrSeries()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s);
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/2026-10-16/skip", new ChangeOccurrence(t.Version)));
        await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/2026-10-17/cancel", new ChangeOccurrence(t.Version)));
        var first = await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today.AddDays(3))); Assert.Equal(2, first.Occurrences.Count(x => x.TaskId.HasValue)); Assert.Equal(OccurrenceState.Skipped, first.Occurrences[1].State); Assert.Null(first.Occurrences[1].TaskId);
        var task = await s.Get(first.Occurrences[0].TaskId!.Value); await s.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = "Yalnız bugün" });
        Assert.Equal("Tekrar", (await s.Get(first.Occurrences[3].TaskId!.Value)).Title); Assert.Equal("Tekrar", (await Ok<RecurrenceTemplateView>(await s.Client.GetAsync($"/api/recurrence-templates/{t.Id}"))).Task.Title);
        Assert.True((await Ok<OccurrenceView>(await s.Client.GetAsync($"/api/tasks/{task.Id}/recurrence"))).TaskChangedSinceSync);
    }
    [Fact]
    public async Task ExistingOccurrenceSkipUsesLifecycleToCloseFocusActualAndFuturePlanAtomically()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s); var occurrence = Assert.Single((await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today))).Occurrences); var taskId = occurrence.TaskId!.Value;
        await ManualPlanningTests.Create(s, taskId, Morning, Morning.AddHours(1)); var f = await FocusTests.Start(s, taskId, new(300)); app.Clock.Now = Morning.AddMinutes(20);
        var effect = await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Post, $"/api/recurrence-templates/{t.Id}/occurrences/2026-10-15/skip", new ChangeOccurrence(t.Version, (await s.Get(taskId)).Version))); Assert.Equal(TaskState.Skipped, Assert.Single(effect.Occurrences).TaskState);
        Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}"))).ActiveSeconds); Assert.Equal(FocusState.Finished, (await TaskScenario.Read<FocusView>(await s.Client.GetAsync($"/api/focus-sessions/{f.Id}"))).State);
        await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today)); await s.State(taskId, TaskAction.Reopen); Assert.Equal(OccurrenceState.Materialized, (await Ok<OccurrenceView>(await s.Client.GetAsync($"/api/tasks/{taskId}/recurrence"))).State);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); var block = await db.TaskSchedules.SingleAsync(x => x.UserId == s.UserId); Assert.Equal(Morning.AddMinutes(20), block.EndsAt);
    }
    [Fact]
    public async Task DstRejectRollsBackWholeWindowAndExplicitShiftProducesOriginalDateAndCorrectUtcDeadline()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = new(2026, 3, 27, 6, 0, 0, TimeSpan.Zero); var s = await TaskScenario.User(app); var from = new DateOnly(2026, 3, 28); var to = from.AddDays(2); var rule = new RecurrenceRule(from, "Europe/Berlin", DueTime: new(2, 30)); var t = await Create(s, rule);
        Assert.Equal(HttpStatusCode.BadRequest, (await Generate(s, t, from, to)).StatusCode); await using var db = fixture.CreateContext(); Assert.False(await db.Tasks.AnyAsync(x => x.UserId == s.UserId)); Assert.False(await db.RecurrenceOccurrences.AnyAsync(x => x.UserId == s.UserId));
        var changed = await Ok<RecurrenceEffect>(await Update(s, t, from, rule with { Gap = GapPolicy.ShiftForward }, "DST")); var made = await Ok<RecurrenceEffect>(await Generate(s, changed.Template, from, to)); var shifted = made.Occurrences[1]; Assert.True(shifted.TimeAdjusted); Assert.Equal(new DateOnly(2026, 3, 29), shifted.LocalDate); Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), shifted.OriginalDueAt); Assert.Equal(shifted.OriginalDueAt, (await s.Get(shifted.TaskId!.Value)).DeadlineAt);
    }
    [Fact]
    public async Task MonthlyLeapClampAndLaterFutureDefinitionSupersessionAreStableAcrossWindows()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = new(2028, 1, 1, 6, 0, 0, TimeSpan.Zero); var s = await TaskScenario.User(app); var t = await Create(s, new(new(2028, 1, 31), Frequency: RecurrenceFrequency.Monthly, MonthDay: 31, MonthEnd: MonthEndPolicy.ClampToLastDay));
        var generated = await Ok<RecurrenceEffect>(await Generate(s, t, new(2028, 1, 1), new(2028, 3, 31))); Assert.Equal(new DateOnly(2028, 2, 29), generated.Occurrences[1].LocalDate); Assert.Equal(3, generated.Occurrences.Length);
        app.Clock.Now = Morning; var daily = await Create(s); var oldFuture = await Ok<RecurrenceEffect>(await Update(s, daily, Today.AddDays(5), new(Today), "Eski gelecek")); var newer = await Ok<RecurrenceEffect>(await Update(s, oldFuture.Template, Today.AddDays(3), new(Today), "Yeni gelecek"));
        var rows = await Ok<RecurrenceEffect>(await Generate(s, newer.Template, Today.AddDays(3), Today.AddDays(7))); foreach (var row in rows.Occurrences) Assert.Equal("Yeni gelecek", (await s.Get(row.TaskId!.Value)).Title);
    }
    [Fact]
    public async Task RefreshEventFailureRestoresEarlierSkippedTaskDefinitionTemplateAndReceipt()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await Create(s); var made = await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today.AddDays(1))); var before = await Day(s); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext();
        await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_recurrence_refresh_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Type\"='RecurrenceRefreshed' THEN RAISE EXCEPTION 'test recurrence refresh failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_recurrence_refresh_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_recurrence_refresh_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Update(s, t, Today, new(Today.AddDays(1), Frequency: RecurrenceFrequency.IntervalDays, Interval: 2), "Yeni", true, Today.AddDays(1), key)).StatusCode);
            Assert.Equal(TaskState.Pending, (await s.Get(made.Occurrences[0].TaskId!.Value)).State); Assert.Equal("Tekrar", (await s.Get(made.Occurrences[1].TaskId!.Value)).Title); Assert.Equal(t.Version, (await Ok<RecurrenceTemplateView>(await s.Client.GetAsync($"/api/recurrence-templates/{t.Id}"))).Version); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion); Assert.Equal(1, await db.RecurrenceDefinitions.CountAsync(x => x.TemplateId == t.Id)); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_recurrence_refresh_test ON task_events; DROP FUNCTION reject_recurrence_refresh_test();"); }
        await Ok<RecurrenceEffect>(await Update(s, t, Today, new(Today.AddDays(1), Frequency: RecurrenceFrequency.IntervalDays, Interval: 2), "Yeni", true, Today.AddDays(1), key));
    }
    [Fact]
    public async Task OwnersBoundsDisableAndDatabaseHistoryAndUniquenessGuardsAreReal()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var t = await Create(s); var made = await Ok<RecurrenceEffect>(await Generate(s, t, Today, Today));
        Assert.Equal(HttpStatusCode.NotFound, (await Generate(other, t)).StatusCode); Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/tasks/{made.Occurrences[0].TaskId}/recurrence")).StatusCode); Assert.Equal(HttpStatusCode.BadRequest, (await Generate(s, t, Today, Today.AddDays(93))).StatusCode);
        var disabled = await Ok<RecurrenceEffect>(await Send(s, HttpMethod.Put, $"/api/recurrence-templates/{t.Id}/enabled", new { version = t.Version, enabled = false })); Assert.Equal(HttpStatusCode.Conflict, (await Generate(s, disabled.Template)).StatusCode);
        Assert.Single((await Ok<RecurrenceTemplatePage>(await s.Client.GetAsync("/api/recurrence-templates?limit=1"))).Items); Assert.Equal(1, (await Ok<OccurrencePage>(await s.Client.GetAsync($"/api/recurrence-templates/{t.Id}/occurrences?fromDate=2026-10-15&toDate=2026-10-17&limit=1"))).Total);
        await using var db = fixture.CreateContext(); await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE recurrence_definitions SET \"TaskDefaults\"='{{}}'::jsonb WHERE \"Id\"={t.DefinitionId}"));
        await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"UPDATE recurrence_occurrences SET \"TimeZoneId\"='UTC' WHERE \"Id\"={made.Occurrences[0].Id}"));
        var original = await db.RecurrenceOccurrences.AsNoTracking().SingleAsync(x => x.TemplateId == t.Id); original.Id = Guid.NewGuid(); original.TaskId = null; original.SyncedTaskVersion = null; original.State = OccurrenceState.Skipped; db.RecurrenceOccurrences.Add(original);
        var duplicate = await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync()); Assert.Equal("23505", ((PostgresException)duplicate.InnerException!).SqlState);
    }
    [Fact]
    public async Task DstSkipIsDurableAndAmbiguousDeadlineRefreshKeepsOriginalInstant()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = new(2026, 3, 28, 6, 0, 0, TimeSpan.Zero); var s = await TaskScenario.User(app); var spring = new DateOnly(2026, 3, 29); var t = await Create(s, new(spring, "Europe/Berlin", DueTime: new(2, 30), Gap: GapPolicy.Skip));
        var skipped = Assert.Single((await Ok<RecurrenceEffect>(await Generate(s, t, spring, spring))).Occurrences); Assert.Null(skipped.TaskId); Assert.Equal(OccurrenceState.Skipped, skipped.State); Assert.Equal("DstGap", skipped.Reason);
        Assert.Equal(skipped.Id, Assert.Single((await Ok<RecurrenceEffect>(await Generate(s, t, spring, spring))).Occurrences).Id);
        app.Clock.Now = new(2026, 10, 24, 6, 0, 0, TimeSpan.Zero); var autumn = new DateOnly(2026, 10, 25); var rule = new RecurrenceRule(autumn, "Europe/Berlin", DueTime: new(2, 30), Overlap: OverlapPolicy.Earlier); var fall = await Create(s, rule);
        var original = Assert.Single((await Ok<RecurrenceEffect>(await Generate(s, fall, autumn, autumn))).Occurrences); var updated = await Ok<RecurrenceEffect>(await Update(s, fall, autumn, rule with { Overlap = OverlapPolicy.Later }, "Sonraki saat", true, autumn)); var row = Assert.Single(updated.Occurrences);
        Assert.Equal(original.OriginalDueAt, row.OriginalDueAt); Assert.Equal(original.OriginalDefinitionId, row.OriginalDefinitionId); Assert.Equal(TimeSpan.FromHours(1), (await s.Get(row.TaskId!.Value)).DeadlineAt - row.OriginalDueAt); Assert.NotEqual(row.OriginalDefinitionId, row.AppliedDefinitionId);
    }
    [Fact]
    public async Task WeeklyCustomWindowAndParallelDifferentKeysReturnSameOccurrenceIds()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var start = new DateOnly(2026, 10, 14); var rule = new RecurrenceRule(start, Frequency: RecurrenceFrequency.Weekly, Interval: 2, WeekDays: [1, 3]); var t = await Create(s, rule);
        var race = await Task.WhenAll(Generate(s, t, start, new(2026, 11, 1)), Generate(s, t, start, new(2026, 11, 1))); var a = await Ok<RecurrenceEffect>(race[0]); var b = await Ok<RecurrenceEffect>(race[1]); Assert.Equal(a.Occurrences.Select(x => x.Id), b.Occurrences.Select(x => x.Id)); Assert.Equal(3, a.Occurrences.Length);
        var pool = await TaskScenario.User(app); Assert.Equal(HttpStatusCode.NotFound, (await pool.Client.GetAsync($"/api/recurrence-templates/{t.Id}/definitions")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Update(s, t with { Version = t.Version + 1 }, Today, rule, "Eski sürüm")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Update(s, t, Today, rule, "Yenile", true)).StatusCode);
    }
}
