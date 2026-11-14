using Adhd.Application.Notifications;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

// Sadece hesap işlem kilidinde kaynak geçerliyse çağrılır. Başka hesabın kaynak adı okunmaz.
internal static class NotificationPresentationReader
{
    internal static async Task<NotificationMessage> Read(PlannerDbContext db, NotificationIntent n, DateTimeOffset now, CancellationToken ct)
    {
        string? name = null;
        FocusState? focusState = null;
        var breakStarted = false;
        if (n.Kind == "Custom")
            name = await db.CustomReminders.AsNoTracking()
                .Where(x => x.UserId == n.UserId && x.Id == n.SourceId && x.Version == n.SourceVersion && !x.Canceled && x.DueAt == n.OccurredAt)
                .Select(x => x.Title).SingleOrDefaultAsync(ct);
        else if (n.Kind == "SpecialDay")
            name = await db.SpecialDays.AsNoTracking()
                .Where(x => x.UserId == n.UserId && x.Id == n.SourceId && x.Version == n.SourceVersion && x.DeletedAt == null)
                .Select(x => x.Title).SingleOrDefaultAsync(ct);
        else if (n.Kind is "FocusTarget" or "BreakEnd")
        {
            var focus = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.SourceId, ct);
            focusState = focus?.State;
            breakStarted = focus?.BreakStartedAt.HasValue == true;
        }
        else if (n.Kind == "TaskDeadline")
            // Görevde başka bir alan değişti diye aralık bitişi uyarısı bozulmasın. Görev sürümü yerine hatırlatma anına bak
            name = (await Adhd.Infrastructure.Tasks.TaskRangeReminders.Instants(db, n.UserId, n.SourceId, ct)).Any(x => x.Occurs == n.OccurredAt)
                ? await db.Tasks.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == n.SourceId).Select(x => x.Title).SingleOrDefaultAsync(ct) : null;
        else if (n.TaskId is { } taskId && n.Kind is "ScheduleStart" or "ScheduleEnd" or "ReturnToTask")
            name = await db.Tasks.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == taskId).Select(x => x.Title).SingleOrDefaultAsync(ct);

        return NotificationPresentation.Build(n.Kind, name, now < n.OccurredAt, focusState, breakStarted);
    }
}
