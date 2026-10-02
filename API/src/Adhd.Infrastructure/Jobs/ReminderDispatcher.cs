using Adhd.Application.Jobs;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Support;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.Infrastructure.Jobs;

public sealed class ReminderDispatcher(PlannerDbContext db, TimeProvider clock, IServiceScopeFactory scopes) : IReminderDispatcher
{
    public async Task<int> RunOnceAsync(int limit, CancellationToken ct)
    {
        if (limit is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(limit)); var now = clock.GetUtcNow();
        var ids = await db.ReminderWork.AsNoTracking().Where(x => x.State == ReminderState.Pending && x.DueAt <= now).OrderBy(x => x.DueAt).ThenBy(x => x.Id).Select(x => x.Id).Take(limit).ToArrayAsync(ct);
        foreach (var id in ids)
        {
            await using var scope = scopes.CreateAsyncScope(); await Dispatch(scope.ServiceProvider.GetRequiredService<PlannerDbContext>(), id, now, ct);
        }
        return ids.Length;
    }
    private static async Task Dispatch(PlannerDbContext db, Guid id, DateTimeOffset now, CancellationToken ct)
    {
        var owner = await db.ReminderWork.AsNoTracking().Where(x => x.Id == id).Select(x => x.UserId).SingleAsync(ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={owner} FOR UPDATE").SingleAsync(ct);
        var work = await db.ReminderWork.SingleAsync(x => x.Id == id && x.UserId == owner, ct); if (work.State != ReminderState.Pending) return;
        var task = await db.Tasks.AsNoTracking().SingleAsync(x => x.UserId == owner && x.Id == work.TaskId, ct); var valid = SupportRules.Open(task);
        if (work.Kind == ReminderKind.TaskDeadline) valid &= task.DeadlineAt == (work.SourceAt ?? work.DueAt);
        else
        {
            var plan = await db.DailyPlans.AsNoTracking().SingleAsync(x => x.UserId == owner && x.Id == work.DailyPlanId, ct);
            var block = await db.TaskSchedules.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == owner && x.Id == work.SourceId && x.State == ScheduleState.Planned, ct);
            valid &= plan.CurrentRevisionId == work.RevisionId && block?.Version == work.SourceVersion && block.TaskId == work.TaskId;
        }
        work.State = !valid ? ReminderState.Obsolete : now - work.DueAt > TimeSpan.FromMinutes(2) ? ReminderState.Expired : ReminderState.Ready; work.HandledAt = now;
        if (work.State == ReminderState.Ready)
        {
            var sourceAt = work.SourceAt ?? work.DueAt; var key = $"{work.Kind}:{work.SourceId}:due:{sourceAt.UtcTicks}"; var intent = await db.NotificationIntents.SingleOrDefaultAsync(x => x.UserId == owner && x.SourceKey == key, ct);
            if (intent is null)
            {
                intent = new() { Id = Guid.CreateVersion7(), UserId = owner, SourceKey = key, Kind = work.Kind.ToString(), SourceId = work.SourceId, TaskId = work.TaskId, OccurredAt = sourceAt, NotBefore = work.DueAt, CreatedAt = now }; db.NotificationIntents.Add(intent);
            }
            intent.SourceVersion = work.SourceVersion; intent.DailyPlanId = work.DailyPlanId; intent.RevisionId = work.RevisionId;
            if (intent.State == NotificationIntentState.Obsolete) intent.State = intent.ReadyAt.HasValue ? NotificationIntentState.Ready : NotificationIntentState.Pending;
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }
}
