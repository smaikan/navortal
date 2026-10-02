using Adhd.Application.Jobs;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

public sealed partial class OutboxHandler
{
    private async Task<bool> WorkChanged(OutboxClaim claim, CancellationToken ct)
    {
        var work = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
        if (work is null || work.Version != claim.SourceVersion) return true;
        var settings = NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId, ct));
        var plannedBreak = await db.FocusSessions.AnyAsync(x => x.UserId == claim.UserId && x.WorkSessionId == work.Id && (x.State == FocusState.Break || x.State == FocusState.AwaitingNext), ct);
        if (work.State == WorkState.Paused && work.TaskId.HasValue && settings.ReturnAfterSeconds > 0 && !plannedBreak)
        {
            var key = $"return:{work.Id}:v{work.Version}"; var instant = await db.WorkSegments.Where(x => x.UserId == claim.UserId && x.SessionId == work.Id && !x.IsVoided).MaxAsync(x => x.EndedAt, ct);
            if (instant.HasValue && !await db.NotificationIntents.AnyAsync(x => x.UserId == claim.UserId && x.SourceKey == key, ct))
                db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = claim.UserId, SourceKey = key, Kind = "ReturnToTask", SourceId = work.Id, SourceVersion = work.Version, TaskId = work.TaskId, OccurredAt = instant.Value.AddSeconds(settings.ReturnAfterSeconds), NotBefore = instant.Value.AddSeconds(settings.ReturnAfterSeconds), CreatedAt = clock.GetUtcNow() });
        }
        return false;
    }
    private async Task<bool> FocusChanged(OutboxClaim claim, CancellationToken ct)
    {
        var focus = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
        if (focus is null || focus.Version != claim.SourceVersion) return true;
        if (focus.State == FocusState.AwaitingNext && focus.BreakEndedAt.HasValue)
        {
            var key = $"break:{focus.Id}:end";
            if (!await db.NotificationIntents.AnyAsync(x => x.UserId == claim.UserId && x.SourceKey == key, ct))
                db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = claim.UserId, SourceKey = key, Kind = "BreakEnd", SourceId = focus.Id, SourceVersion = focus.Version,
                    TaskId = await db.WorkSessions.Where(x => x.UserId == claim.UserId && x.Id == focus.WorkSessionId).Select(x => x.TaskId).SingleAsync(ct), OccurredAt = focus.BreakEndedAt.Value, CreatedAt = clock.GetUtcNow() });
        }
        return false;
    }
}
