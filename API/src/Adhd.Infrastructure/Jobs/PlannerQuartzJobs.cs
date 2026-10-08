using System.Text.Json;
using Adhd.Application.Focus;
using Adhd.Application.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Quartz;

namespace Adhd.Infrastructure.Jobs;

[DisallowConcurrentExecution]
public sealed class OutboxPumpJob(IOutboxDispatcher dispatcher) : IJob
{
    private const int Batch = 20;
    private static readonly TimeSpan Budget = TimeSpan.FromSeconds(10);
    // Grup doluysa sırada iş kalmış demektir. Sınırlı bir süre daha iş al,
    // iki saniye bekleme. Yoksa yoğun bir kuyruk herkesi saniyede on işe düşürür
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct)
    {
        var started = System.Diagnostics.Stopwatch.GetTimestamp();
        while (await dispatcher.RunOnceAsync(Batch, ct) == Batch && System.Diagnostics.Stopwatch.GetElapsedTime(started) < Budget) { }
    }
}
[DisallowConcurrentExecution]
public sealed class ReminderPumpJob(IReminderDispatcher dispatcher) : IJob
{
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct) => _ = await dispatcher.RunOnceAsync(20, ct);
}
[DisallowConcurrentExecution, PersistJobDataAfterExecution]
public sealed class FocusSweepJob(PlannerDbContext db, IServiceScopeFactory scopes) : IJob
{
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct)
    {
        var cursor = Cursor(context);
        var rows = await db.FocusSessions.FromSqlInterpolated($"""
            SELECT * FROM focus_sessions WHERE "Id">{cursor} AND ("State"='Break' OR ("State"='Working' AND ("TargetReachedAt" IS NULL OR "Settings"->>'targetBehavior'='AutoBreak')))
            ORDER BY "Id" LIMIT 50
            """).AsNoTracking().ToArrayAsync(ct);
        foreach (var focus in rows)
        {
            await using var scope = scopes.CreateAsyncScope(); _ = await scope.ServiceProvider.GetRequiredService<FocusService>().GetAsync(focus.UserId, focus.Id, ct);
        }
        context.JobDetail.JobDataMap["cursor"] = (rows.LastOrDefault()?.Id ?? Guid.Empty).ToString();
    }
    internal static Guid Cursor(IJobExecutionContext context) => context.JobDetail.JobDataMap.TryGetValue("cursor", out var raw) && Guid.TryParse(raw as string, out var id) ? id : Guid.Empty;
}
[DisallowConcurrentExecution, PersistJobDataAfterExecution]
public sealed class RecurrenceSweepJob(PlannerDbContext db, TimeProvider clock) : IJob
{
    public async ValueTask Execute(IJobExecutionContext context, CancellationToken ct)
    {
        var cursor = FocusSweepJob.Cursor(context); var rows = await db.RecurrenceTemplates.FromSqlInterpolated($"SELECT * FROM recurrence_templates WHERE \"Enabled\" AND \"Id\">{cursor} ORDER BY \"Id\" LIMIT 50").AsNoTracking().ToArrayAsync(ct);
        var ids = rows.Select(x => x.Id).ToArray(); var definitions = await db.RecurrenceDefinitions.AsNoTracking().Where(x => ids.Contains(x.TemplateId)).GroupBy(x => x.TemplateId).Select(g => g.OrderByDescending(x => x.Number).First()).ToDictionaryAsync(x => x.TemplateId, ct);
        foreach (var template in rows)
        {
            var rule = JsonSerializer.Deserialize<RecurrenceRule>(definitions[template.Id].Rule, RevisionWriter.Json)!; var now = clock.GetUtcNow(); var date = PlanTime.Date(now, rule.TimeZoneId); var payload = JsonSerializer.Serialize(new RecurrenceWindowPayload(template.Id, template.Version, date, date.AddDays(7)), RevisionWriter.Json); var key = $"recurrence-window:{template.Id}:v{template.Version}:{date:yyyyMMdd}"; var id = Guid.CreateVersion7();
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                VALUES ({id},{template.UserId},{key},'RecurrenceWindow',{template.Id},{template.Version},{payload}::jsonb,{now},{now},'Pending',0,1)
                ON CONFLICT ("UserId","EventKey") DO NOTHING
                """, ct);
        }
        context.JobDetail.JobDataMap["cursor"] = (rows.LastOrDefault()?.Id ?? Guid.Empty).ToString();
    }
}
