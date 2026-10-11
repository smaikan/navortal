using System.Data;
using Adhd.Application.Planning;
using Adhd.Application.Work;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Notifications;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore : IDaySignalsStore
{
    public async Task<DaySignalsView> SignalsAsync(Guid userId, DateOnly date, bool observeFocus, CancellationToken ct)
    {
        if (date.Year is < 2 or > 9998)
            throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Validation, "date_invalid", "Geçerli plan günü girin.");
        await using var tx = await db.Database.BeginTransactionAsync(observeFocus ? IsolationLevel.ReadCommitted : IsolationLevel.RepeatableRead, ct);
        if (observeFocus) _ = await Lock(userId, ct);
        var now = clock.GetUtcNow(); var prefs = (await preferences.ReadAsync(userId, ct)).Values;
        var running = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        // Bugün uyarısının gözlem sınırı aynı kalsın. Başka günü okurken işlem başlatma
        var includeFocus = observeFocus && prefs.UiSupports.Nudges && running is not null && date == PlanTime.Date(now, prefs.TimeZoneId);
        var focus = includeFocus ? await ObserveCurrentFocus(userId, await Lock(userId, ct), now, ct) : null;
        if (includeFocus) running = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        var settings = NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct));
        var threshold = settings.ReturnToTask && settings.ReturnAfterSeconds > 0 ? settings.ReturnAfterSeconds : 1800;
        var latest = await db.WorkSessions.AsNoTracking().Where(x => x.UserId == userId)
            .OrderByDescending(x => x.StartedAt).ThenByDescending(x => x.Id).FirstOrDefaultAsync(ct);
        var segments = latest is null ? [] : await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == latest.Id).ToArrayAsync(ct);
        WorkView? last = latest is null ? null : View(latest, Measured(segments, now), now);
        var latestId = latest?.Id;
        var receipts = await db.NotificationIntents.AsNoTracking()
            .Where(n => n.UserId == userId && n.State == NotificationIntentState.Ready && n.ReadAt == null
                && ((n.Kind == "ReturnToTask" && latestId != null && n.SourceId == latestId)
                    || ((n.Kind == "ScheduleStart" || n.Kind == "ScheduleEnd") && db.TaskSchedules.Any(s => s.UserId == userId && s.Id == n.SourceId
                        && db.DailyPlans.Any(p => p.UserId == userId && p.Id == s.DailyPlanId && p.LocalDate == date)))))
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
            .Select(x => new NotificationReceiptView(x.Id, x.Kind, x.SourceId, x.ReadAt, x.State, x.SnoozeCount)).Take(1001).ToArrayAsync(ct);
        var task = running?.TaskId is { } taskId ? await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.Id == taskId)
            .Select(x => new RunningTaskContext(x.Id, x.HasDirectWork, x.DirectEstimatedSeconds)).SingleOrDefaultAsync(ct) : null;
        var result = new DaySignalsView(date, now, threshold, receipts.Take(1000).ToArray(), receipts.Length <= 1000,
            last, includeFocus, focus?.Session, running?.Id, task);
        await tx.CommitAsync(ct); return result;
    }
}
