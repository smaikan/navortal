using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Support;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Focus;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

internal static class NotificationSources
{
    internal static async Task<bool> Valid(PlannerDbContext db, NotificationIntent n, DateTimeOffset now, CancellationToken ct)
    {
        if (n.TaskId.HasValue)
        {
            var task = await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.TaskId, ct);
            if (task is null || !SupportRules.Open(task)) return false;
        }
        switch (n.Kind)
        {
            case "ScheduleStart": case "ScheduleEnd":
                var plan = await db.DailyPlans.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.DailyPlanId, ct);
                var block = await db.TaskSchedules.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.SourceId, ct);
                return plan?.CurrentRevisionId == n.RevisionId && block?.State == ScheduleState.Planned && block.Version == n.SourceVersion && block.TaskId == n.TaskId &&
                    (n.Kind == "ScheduleStart" ? block.StartsAt : block.EndsAt) == n.OccurredAt;
            case "TaskDeadline":
                return await db.Tasks.AnyAsync(x => x.UserId == n.UserId && x.Id == n.SourceId && x.DeadlineAt == n.OccurredAt, ct);
            case "FocusTarget": case "BreakEnd":
                var focus = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.SourceId, ct);
                if (focus is null || focus.State is FocusState.Finished or FocusState.Interrupted || !FocusLifecycle.Settings(focus).NotificationsEnabled) return false;
                if (n.Kind == "BreakEnd") return focus.State == FocusState.AwaitingNext && focus.BreakEndedAt == n.OccurredAt;
                var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == n.UserId && x.SessionId == focus.WorkSessionId).ToArrayAsync(ct);
                return FocusRules.Measure(focus, FocusLifecycle.Settings(focus), segments, now).TargetInstant.HasValue;
            case "ReturnToTask":
                return await db.WorkSessions.AnyAsync(x => x.UserId == n.UserId && x.Id == n.SourceId && x.Version == n.SourceVersion && x.State == WorkState.Paused, ct);
            case "Custom":
                return await db.CustomReminders.AnyAsync(x => x.UserId == n.UserId && x.Id == n.SourceId && x.Version == n.SourceVersion && !x.Canceled && x.DueAt == n.OccurredAt, ct);
            default: return false;
        }
    }
}
