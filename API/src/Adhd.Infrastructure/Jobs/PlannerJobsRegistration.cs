using Adhd.Application.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Quartz;

namespace Adhd.Infrastructure.Jobs;

public static class PlannerJobsRegistration
{
    public static IServiceCollection AddPlannerJobs(this IServiceCollection services, IConfiguration configuration, bool runHostedJobs)
    {
        services.AddScoped<IOutboxStore, OutboxStore>(); services.AddScoped<IOutboxHandler, OutboxHandler>(); services.AddScoped<IOutboxDispatcher, OutboxDispatcher>(); services.AddScoped<IReminderDispatcher, ReminderDispatcher>(); services.AddScoped<JobService>();
        services.AddQuartz(q =>
        {
            q.ConfigureScheduler(o => { o.InstanceName = "AdhdPlanner"; o.GenerateInstanceId = true; }); q.UseDefaultThreadPool(o => o.MaxConcurrency = 2);
            q.UsePersistentStore(store =>
            {
                store.UsePostgres(o => o.ConnectionStringName = "Planner");
                store.ConfigureStore(o => { o.TablePrefix = "qrtz_"; o.StoreJobDataAsStrings = true; }); store.UseClustering(o => o.CheckinInterval = TimeSpan.FromSeconds(10)); store.UseExecutionHistory();
            });
            q.ScheduleJob<OutboxPumpJob>(t => t.WithIdentity("outbox-pump", "adhd").StartNow().WithSimpleSchedule(s => s.WithInterval(TimeSpan.FromSeconds(2)).RepeatForever().WithMisfireInstruction(SimpleTriggerMisfireInstruction.NextWithRemainingCount)), j => j.WithIdentity("outbox-pump", "adhd"));
            q.ScheduleJob<ReminderPumpJob>(t => t.WithIdentity("reminder-pump", "adhd").StartNow().WithSimpleSchedule(s => s.WithInterval(TimeSpan.FromSeconds(2)).RepeatForever().WithMisfireInstruction(SimpleTriggerMisfireInstruction.NextWithRemainingCount)), j => j.WithIdentity("reminder-pump", "adhd"));
            q.ScheduleJob<FocusSweepJob>(t => t.WithIdentity("focus-sweep", "adhd").StartNow().WithSimpleSchedule(s => s.WithInterval(TimeSpan.FromSeconds(1)).RepeatForever().WithMisfireInstruction(SimpleTriggerMisfireInstruction.NextWithRemainingCount)), j => j.WithIdentity("focus-sweep", "adhd"));
            q.ScheduleJob<MaintenanceJob>(t => t.WithIdentity("maintenance", "adhd").StartNow().WithSimpleSchedule(s => s.WithInterval(TimeSpan.FromMinutes(10)).RepeatForever().WithMisfireInstruction(SimpleTriggerMisfireInstruction.NextWithRemainingCount)), j => j.WithIdentity("maintenance", "adhd"));
            q.ScheduleJob<RecurrenceSweepJob>(t => t.WithIdentity("recurrence-sweep", "adhd").StartNow().WithSimpleSchedule(s => s.WithInterval(TimeSpan.FromSeconds(30)).RepeatForever().WithMisfireInstruction(SimpleTriggerMisfireInstruction.NextWithRemainingCount)), j => j.WithIdentity("recurrence-sweep", "adhd"));
        });
        services.Configure<QuartzOptions>(o => { o.Scheduling.IgnoreDuplicates = true; o.Scheduling.OverwriteExistingData = false; });
        if (runHostedJobs && configuration.GetValue("Jobs:Enabled", true)) services.AddQuartzHostedService(o => o.WaitForJobsToComplete = true);
        return services;
    }
}
