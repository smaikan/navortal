using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Focus;
using Adhd.Application.Jobs;
using Adhd.Application.Recurrence;
using Adhd.Application.Work;
using Adhd.Domain.Jobs;
using Adhd.Domain.Recurrence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Adhd.IntegrationTests.JobScenario;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class OutboxTests
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    [Fact]
    public async Task DomainAndFullRevisionOutboxShareRollbackAndPreviewDoesNotPublishAPlanChange()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root(); await using var db = s.Context(); Assert.Equal(1, await db.Outbox.CountAsync(x => x.UserId == s.User.UserId && x.Kind == "TaskChanged"));
        var created = await Create(s.User, task.Id, Morning.AddMinutes(10), Morning.AddMinutes(40)); Assert.True(await db.Outbox.AnyAsync(x => x.UserId == s.User.UserId && x.Kind == "PlanChanged" && x.SourceId == created.RevisionIds[0]));
        var before = await db.Outbox.CountAsync(x => x.UserId == s.User.UserId); await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_jobs_plan_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test outbox rollback'; END $$; CREATE TRIGGER reject_jobs_plan_test BEFORE INSERT ON plan_revision_items FOR EACH ROW EXECUTE FUNCTION reject_jobs_plan_test();");
        try
        {
            var day = await Day(s.User); Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s.User, HttpMethod.Post, "/api/schedules", new { localDate = "2026-10-15", taskId = task.Id, kind = "Work", startsAt = Morning.AddHours(1), endsAt = Morning.AddHours(2), expectedPlanningVersion = day.PlanningVersion })).StatusCode);
            Assert.Equal(before, await db.Outbox.CountAsync(x => x.UserId == s.User.UserId)); Assert.Equal(created.RevisionIds[0], (await Day(s.User)).CurrentRevisionId);
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_jobs_plan_test ON plan_revision_items; DROP FUNCTION reject_jobs_plan_test();"); }
        await SchedulingHttpTests.Configure(s.User); await s.User.Define(task.Id, true, 3600); before = await db.Outbox.CountAsync(x => x.Kind == "PlanChanged"); await SchedulingHttpTests.Preview(s.User, task.Id); Assert.Equal(before, await db.Outbox.CountAsync(x => x.Kind == "PlanChanged")); Assert.False(await db.NotificationIntents.AnyAsync());
    }
    [Fact]
    public async Task TwoWorkersClaimDisjointMessagesUsingRealDatabaseLocks()
    {
        await using var s = await JobScenario.Create(); for (var i = 0; i < 10; i++) await s.User.Root($"İş{i}");
        var race = await Task.WhenAll(s.Claim(5), s.Claim(5)); Assert.Equal(5, race[0].Length); Assert.Equal(5, race[1].Length); Assert.Empty(race[0].Select(x => x.Id).Intersect(race[1].Select(x => x.Id))); Assert.All(race.SelectMany(x => x), x => Assert.Equal(1, x.Attempts));
        Assert.Empty(await s.Claim());
    }
    [Fact]
    public async Task OnePumpTickDrainsABacklogLargerThanOneBatchAcrossOwners()
    {
        await using var s = await JobScenario.Create(); var other = await TaskScenario.User(s.App);
        await using (var db = s.Context())
        {
            // Kaynak yoksa etki Obsolete. Bu test kuyruk hızına bakıyor
            for (var i = 0; i < 75; i++) db.Outbox.Add(new() { Id = Guid.CreateVersion7(), UserId = i % 3 == 0 ? other.UserId : s.User.UserId, EventKey = $"backlog:{i}", Kind = "TaskChanged", SourceId = Guid.NewGuid(), SourceVersion = 1, OccurredAt = Morning, AvailableAt = Morning });
            await db.SaveChangesAsync();
        }
        await using (var scope = s.App.Services.CreateAsyncScope()) await new Adhd.Infrastructure.Jobs.OutboxPumpJob(scope.ServiceProvider.GetRequiredService<IOutboxDispatcher>()).Execute(null!, default);
        await using var after = s.Context(); Assert.Equal(0, await after.Outbox.CountAsync(x => x.State == OutboxState.Pending || x.State == OutboxState.Processing)); Assert.Equal(75, await after.Outbox.CountAsync(x => x.EventKey.StartsWith("backlog:") && x.State == OutboxState.Obsolete));
    }
    [Fact]
    public async Task EffectCommitThenLostAckSurvivesHostRestartLeaseExpiryAndDoesNotDuplicateReminder()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root(); task = await s.User.Get(task.Id); await s.User.Client.PutAsJsonAsync($"/api/tasks/{task.Id}", new { version = task.Version, title = task.Title, deadlineAt = Morning.AddMinutes(30) });
        var claims = await s.Claim(); var current = claims.OrderByDescending(x => x.SourceVersion).First(x => x.SourceId == task.Id); Assert.False(await s.Effect(current));
        await using (var db = s.Context()) { Assert.Equal(1, await db.ReminderWork.CountAsync()); Assert.Equal(JobEffectState.Completed, (await db.JobEffects.SingleAsync(x => x.OutboxId == current.Id)).State); Assert.Equal(OutboxState.Processing, (await db.Outbox.SingleAsync(x => x.Id == current.Id)).State); }
        await s.Restart(Morning.AddMinutes(3)); await s.Pump(); await using var after = s.Context(); Assert.Equal(1, await after.ReminderWork.CountAsync()); Assert.Equal(OutboxState.Completed, (await after.Outbox.SingleAsync(x => x.Id == current.Id)).State); Assert.Equal(2, (await after.Outbox.SingleAsync(x => x.Id == current.Id)).Attempts);
    }
    [Fact]
    public async Task RetryIsBoundedFailuresAreVisibleAndOnlyOwnerCanExplicitlyRetry()
    {
        await using var s = await JobScenario.Create(); var id = Guid.NewGuid(); await using (var db = s.Context()) { db.Outbox.Add(new() { Id = id, UserId = s.User.UserId, EventKey = "poison", Kind = "Unknown", SourceId = id, OccurredAt = Morning, AvailableAt = Morning }); await db.SaveChangesAsync(); }
        for (var i = 0; i < JobRetry.MaxAttempts; i++)
        {
            await s.Pump(); await using var db = s.Context(); var row = await db.Outbox.SingleAsync(x => x.Id == id); Assert.Equal(i + 1, row.Attempts); s.App.Clock.Now = row.AvailableAt;
        }
        var page = await TaskScenario.Read<OutboxPage>(await s.User.Client.GetAsync("/api/jobs/outbox?state=Failed")); var failed = Assert.Single(page.Items); Assert.Equal("unknown_outbox_kind", failed.LastErrorCode); Assert.Equal(5, failed.Attempts);
        var other = await TaskScenario.User(s.App); Assert.Empty((await TaskScenario.Read<OutboxPage>(await other.Client.GetAsync("/api/jobs/outbox"))).Items); Assert.Equal(HttpStatusCode.NotFound, (await other.Client.PostAsJsonAsync($"/api/jobs/outbox/{id}/retry", new { version = failed.Version })).StatusCode);
        var retry = await s.User.Client.PostAsJsonAsync($"/api/jobs/outbox/{id}/retry", new { version = failed.Version }); Assert.Equal(HttpStatusCode.OK, retry.StatusCode); var ready = await TaskScenario.Read<OutboxView>(retry); Assert.Equal(0, ready.Attempts); Assert.Equal(OutboxState.Pending, ready.State);
        Assert.Equal(HttpStatusCode.Conflict, (await s.User.Client.PostAsJsonAsync($"/api/jobs/outbox/{id}/retry", new { version = failed.Version })).StatusCode);
    }
    [Fact]
    public async Task LastAttemptCrashBecomesFailedInsteadOfStayingProcessingForever()
    {
        await using var s = await JobScenario.Create(); var id = Guid.NewGuid(); await using var db = s.Context(); db.Outbox.Add(new() { Id = id, UserId = s.User.UserId, EventKey = "last-crash", Kind = "Unknown", SourceId = id, OccurredAt = Morning, AvailableAt = Morning, State = OutboxState.Processing, Attempts = 5, LeaseId = Guid.NewGuid(), LeaseUntil = Morning.AddSeconds(-1) }); await db.SaveChangesAsync();
        Assert.Empty(await s.Claim()); db.ChangeTracker.Clear(); var failed = await db.Outbox.SingleAsync(x => x.Id == id); Assert.Equal(OutboxState.Failed, failed.State); Assert.Equal("lease_expired_at_limit", failed.LastErrorCode);
    }
    [Fact]
    public async Task OldRevisionReminderIsInvalidatedAndUnchangedDueTimeHasOneLogicalIntent()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root(); var first = await Create(s.User, task.Id, Morning.AddMinutes(10), Morning.AddMinutes(40)); await s.Pump(); await using var db = s.Context(); Assert.Equal(2, await db.ReminderWork.CountAsync());
        var moved = await Change(s.User, first.Schedules[0], start: Morning.AddMinutes(20), end: Morning.AddMinutes(50)); Assert.Equal(HttpStatusCode.OK, moved.StatusCode); await s.Pump(); Assert.Equal(2, await db.ReminderWork.CountAsync(x => x.State == ReminderState.Obsolete));
        s.App.Clock.Now = Morning.AddMinutes(11); await s.Reminders(); Assert.False(await db.NotificationIntents.AnyAsync()); s.App.Clock.Now = Morning.AddMinutes(21); await s.Reminders(); var intent = await db.NotificationIntents.AsNoTracking().SingleAsync(); Assert.Equal("ScheduleStart", intent.Kind);
        await Create(s.User, null, Morning.AddMinutes(50), Morning.AddMinutes(55), "Break"); await s.Pump(); await s.Reminders(); var current = await db.NotificationIntents.AsNoTracking().SingleAsync(); Assert.Equal(intent.Id, current.Id); Assert.Equal((await Day(s.User)).CurrentRevisionId, current.RevisionId); Assert.Equal(NotificationIntentState.Pending, current.State);
    }
    [Fact]
    public async Task RestartMisfireExpiresOldRemindersAndFocusTargetRetryKeepsOneIntentWhileWorkContinues()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root(); await Create(s.User, task.Id, Morning.AddMinutes(1), Morning.AddMinutes(2)); await s.Pump(); s.App.Clock.Now = Morning.AddDays(1); await s.Reminders(); await using var db = s.Context(); Assert.False(await db.NotificationIntents.AnyAsync()); Assert.Equal(2, await db.ReminderWork.CountAsync(x => x.State == ReminderState.Expired));
        var f = await FocusTests.Start(s.User, task.Id, new(60)); s.App.Clock.Now = s.App.Clock.Now.AddMinutes(2); f = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{f.Id}")); var claims = await s.Claim(); var target = Assert.Single(claims, x => x.Kind == "FocusTargetReached"); Assert.False(await s.Effect(target));
        s.App.Clock.Now = s.App.Clock.Now.AddMinutes(3); await s.Pump(); Assert.Equal(1, await db.NotificationIntents.CountAsync(x => x.Kind == "FocusTarget")); Assert.Equal(Adhd.Domain.Work.WorkState.Running, (await TaskScenario.Read<WorkView>(await s.User.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}"))).State);
    }
    [Fact]
    public async Task PreparedRecurrenceCommandResumesAfterCrashAcrossMidnightWithoutRecomputingItsWindow()
    {
        await using var s = await JobScenario.Create(); var today = new DateOnly(2026, 10, 15); var body = new RecurrenceCreate(new(today, UntilDate: today.AddDays(1)), new("Kalıcı tekrar"));
        var created = await s.User.Client.PostAsJsonAsync("/api/recurrence-templates", body, Json); Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode); // Komut anahtarı gerekiyor
        var r = await Send(s.User, HttpMethod.Post, "/api/recurrence-templates", JsonSerializer.SerializeToElement(body, Json)); Assert.Equal(HttpStatusCode.Created, r.StatusCode); var template = (await TaskScenario.Read<RecurrenceEffect>(r)).Template; var claim = Assert.Single(await s.Claim(), x => x.Kind == "RecurrenceChanged"); var command = new MaterializeRecurrence(template.Version, today, today.AddDays(7));
        await using (var db = s.Context()) { db.JobEffects.Add(new() { OutboxId = claim.Id, UserId = claim.UserId, State = JobEffectState.Prepared, CreatedAt = Morning, ResolvedInput = JsonSerializer.Serialize(new { templateId = template.Id, command }, Json) }); await db.SaveChangesAsync(); }
        await using (var scope = s.App.Services.CreateAsyncScope()) { _ = await scope.ServiceProvider.GetRequiredService<RecurrenceService>().MaterializeAsync(claim.UserId, template.Id, command, $"job:{claim.Id}", default); }
        await s.Restart(Morning.AddDays(1)); await s.Pump(); await using var after = s.Context(); Assert.Equal(2, await after.Tasks.CountAsync()); Assert.Equal(JobEffectState.Completed, (await after.JobEffects.SingleAsync(x => x.OutboxId == claim.Id)).State); Assert.Equal(OutboxState.Completed, (await after.Outbox.SingleAsync(x => x.Id == claim.Id)).State);
    }
    [Fact]
    public async Task RecurrenceOutboxRunsRealMaterializationAndExpiredUnpreparedWindowDoesNotBackfill()
    {
        await using var s = await JobScenario.Create(); var today = new DateOnly(2026, 10, 15); var body = new RecurrenceCreate(new(today, UntilDate: today.AddDays(2)), new("Worker oluşturdu"));
        var r = await Send(s.User, HttpMethod.Post, "/api/recurrence-templates", JsonSerializer.SerializeToElement(body, Json)); var template = (await TaskScenario.Read<RecurrenceEffect>(r)).Template; await s.Pump();
        await using var db = s.Context(); Assert.Equal(3, await db.Tasks.CountAsync()); Assert.Equal(3, await db.RecurrenceOccurrences.CountAsync()); var id = Guid.NewGuid();
        db.Outbox.Add(new() { Id = id, UserId = s.User.UserId, Kind = "RecurrenceWindow", SourceId = template.Id, SourceVersion = template.Version, EventKey = "expired-window", OccurredAt = Morning, AvailableAt = Morning,
            Payload = JsonSerializer.Serialize(new { templateId = template.Id, version = template.Version, fromDate = today.AddDays(-1), toDate = today.AddDays(6) }, Json) }); await db.SaveChangesAsync(); await s.Pump();
        Assert.Equal(OutboxState.Obsolete, (await db.Outbox.AsNoTracking().SingleAsync(x => x.Id == id)).State); Assert.Equal(3, await db.Tasks.CountAsync());
    }
    [Fact]
    public async Task CorrectedBelowTargetWorkKeepsHistoricalTargetButDoesNotPrepareAnInvalidAlarm()
    {
        await using var s = await JobScenario.Create(); var task = await s.User.Root(); var f = await FocusTests.Start(s.User, task.Id, new(60)); s.App.Clock.Now = Morning.AddMinutes(2);
        f = await TaskScenario.Read<FocusView>(await s.User.Client.GetAsync($"/api/focus-sessions/{f.Id}")); var work = await TaskScenario.Read<WorkView>(await s.User.Client.GetAsync($"/api/work-sessions/{f.WorkSessionId}"));
        var segment = Assert.Single((await TaskScenario.Read<SegmentPage>(await s.User.Client.GetAsync($"/api/work-sessions/{work.Id}/segments"))).Items);
        Assert.Equal(HttpStatusCode.OK, (await s.User.Client.PostAsJsonAsync($"/api/work-sessions/{work.Id}/segments/{segment.Id}/corrections", new { version = work.Version, segmentVersion = segment.Version, startedAt = Morning.AddSeconds(90), endedAt = (DateTimeOffset?)null, isVoided = false, reason = "Geç başlayan çalışma" })).StatusCode);
        await s.Pump(); await using var db = s.Context(); Assert.False(await db.NotificationIntents.AnyAsync()); Assert.NotNull((await db.FocusSessions.SingleAsync()).TargetReachedAt); Assert.Equal(OutboxState.Obsolete, (await db.Outbox.SingleAsync(x => x.Kind == "FocusTargetReached")).State);
    }
}
