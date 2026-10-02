using Adhd.Application.Common;
using Adhd.Application.Recurrence;
using Adhd.Domain.Recurrence;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Quartz;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Adhd.IntegrationTests;

public sealed class QuartzPersistenceTests
{
    private static void RealClock(IServiceCollection services)
    {
        services.RemoveAll<TimeProvider>(); services.AddSingleton<TimeProvider>(new UtcTimeProvider(TimeProvider.System)); services.AddTransient<QuartzRestartProofJob>();
    }
    private static async Task Until(Func<Task<bool>> check, int seconds = 20)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(seconds);
        while (DateTimeOffset.UtcNow < deadline) { if (await check()) return; await Task.Delay(150); }
        Assert.True(await check(), "Persistent scheduler did not produce its expected effect in time.");
    }
    [Fact]
    public async Task RealPostgresQuartzObservesFocusWithoutHttpTickAndRestoresStoredTriggerAcrossHosts()
    {
        var dbOwner = new DatabaseFixture(); await dbOwner.InitializeAsync(); PlannerFactory? app = null;
        try
        {
            app = new(dbOwner.ConnectionString, RealClock, runJobs: true); var user = await TaskScenario.User(app); var f = await FocusTests.Start(user, settings: new(1));
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.FocusSessions.AnyAsync(x => x.Id == f.Id && x.TargetReachedAt != null); });
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.NotificationIntents.AnyAsync(x => x.UserId == user.UserId && x.Kind == "FocusTarget"); });
            var scheduler = await app.Services.GetRequiredService<ISchedulerFactory>().GetScheduler(); var metadata = await scheduler.GetMetadata(); Assert.True(metadata.JobStorePersistent); Assert.True(metadata.JobStoreClustered);
            var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } }; var today = Adhd.Domain.Planning.PlanTime.Date(DateTimeOffset.UtcNow, "Europe/Istanbul");
            var recurrence = new RecurrenceCreate(new(today, UntilDate: today.AddDays(1)), new("Gerçek worker"));
            var created = await ManualPlanningTests.Send(user, HttpMethod.Post, "/api/recurrence-templates", JsonSerializer.SerializeToElement(recurrence, json)); Assert.Equal(System.Net.HttpStatusCode.Created, created.StatusCode);
            var template = (await TaskScenario.Read<RecurrenceEffect>(created)).Template;
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.RecurrenceOccurrences.CountAsync(x => x.TemplateId == template.Id) == 2; });
            await scheduler.TriggerJob(new("recurrence-sweep", "adhd"));
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.Outbox.AnyAsync(x => x.UserId == user.UserId && x.Kind == "RecurrenceWindow" && x.State == Adhd.Domain.Jobs.OutboxState.Completed); });
            var task = await user.Root("Gerçek reminder"); var scheduledAt = DateTimeOffset.UtcNow.AddSeconds(3);
            await ManualPlanningTests.Create(user, task.Id, scheduledAt, scheduledAt.AddSeconds(15));
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.NotificationIntents.AnyAsync(x => x.TaskId == task.Id && x.Kind == "ScheduleStart"); });
            var periodic = await scheduler.GetTrigger(new("focus-sweep", "adhd")); Assert.NotNull(periodic); var originalStart = periodic.StartTimeUtc;
            var job = JobBuilder.Create<QuartzRestartProofJob>().WithIdentity("restart-proof", "adhd-test").Build(); var trigger = TriggerBuilder.Create().WithIdentity("restart-proof", "adhd-test").StartAt(DateTimeOffset.UtcNow.AddSeconds(8)).Build();
            await scheduler.ScheduleJob(job, trigger); var authorization = user.Client.DefaultRequestHeaders.Authorization; await app.DisposeAsync(); app = null;
            await using (var db = dbOwner.CreateContext()) { Assert.False(await db.Metadata.AnyAsync(x => x.Key == "quartz-restart-proof")); }
            app = new(dbOwner.ConnectionString, RealClock, runJobs: true); var client = app.CreateClient(); client.DefaultRequestHeaders.Authorization = authorization; Assert.Equal(System.Net.HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
            var restarted = await app.Services.GetRequiredService<ISchedulerFactory>().GetScheduler(); Assert.Equal(originalStart, (await restarted.GetTrigger(new("focus-sweep", "adhd")))!.StartTimeUtc);
            await Until(async () => { await using var db = dbOwner.CreateContext(); return await db.Metadata.AnyAsync(x => x.Key == "quartz-restart-proof"); });
            await app.DisposeAsync(); app = null;
            await using var after = dbOwner.CreateContext(); Assert.Equal(1, await after.NotificationIntents.CountAsync(x => x.UserId == user.UserId && x.Kind == "FocusTarget")); Assert.Equal(Adhd.Domain.Work.WorkState.Running, (await after.WorkSessions.SingleAsync(x => x.Id == f.WorkSessionId)).State);
            Assert.Equal(1, await after.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM qrtz_execution_history WHERE job_name='restart-proof' AND job_group='adhd-test'").SingleAsync());
        }
        finally { if (app is not null) await app.DisposeAsync(); await dbOwner.DisposeAsync(); }
    }
}

[DisallowConcurrentExecution]
public sealed class QuartzRestartProofJob(PlannerDbContext db) : IJob
{
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct) => _ = await db.Database.ExecuteSqlRawAsync("INSERT INTO app_metadata (\"Key\",\"Value\") VALUES ('quartz-restart-proof','committed') ON CONFLICT (\"Key\") DO NOTHING", ct);
}
