using Adhd.Application.Notifications;
using Adhd.Application.Preferences;
using Adhd.Domain.Jobs;
using Adhd.Infrastructure.Focus;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

// Yalnız mobil FCM yükü için; görev/olay adı, zaman ve kısa not okur. Web Push metni NotificationPresentationReader'dadır.
// Okuma başarısız olursa genel metne düşer; teslim bu yüzden bozulmaz.
internal static class MobilePushPresentationReader
{
    internal static async Task<NotificationMessage> Read(PlannerDbContext db, IPreferencesStore preferences, NotificationIntent n,
        DateTimeOffset now, CancellationToken ct)
    {
        try
        {
            var zone = (await preferences.ReadAsync(n.UserId, ct)).Values.TimeZoneId;
            string? name = null, note = null, specialKind = null;
            DateTimeOffset? starts = null, ends = null; DateOnly? rangeEnd = null;
            int? focusSeconds = null;
            async Task<(string Title, string? Description)?> Task(Guid? id)
            {
                if (id is not { } taskId) return null;
                var row = await db.Tasks.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == taskId)
                    .Select(x => new { x.Title, x.Description }).SingleOrDefaultAsync(ct);
                return row is null ? null : (row.Title, row.Description);
            }
            switch (n.Kind)
            {
                case "ScheduleStart" or "ScheduleEnd":
                    var block = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == n.SourceId)
                        .Select(x => new { x.StartsAt, x.EndsAt }).SingleOrDefaultAsync(ct);
                    starts = block?.StartsAt; ends = block?.EndsAt;
                    if (await Task(n.TaskId) is { } scheduled) (name, note) = scheduled;
                    break;
                case "TaskDeadline":
                    if (await Task(n.SourceId) is { } due) (name, note) = due;
                    // Olay anı hep aralığın bitiş günü 09:00 (yerel saat); bildirim bir gün önce 18:00'de de gelebilir.
                    rangeEnd = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(n.OccurredAt, TimeZoneInfo.FindSystemTimeZoneById(zone)).Date);
                    break;
                case "ReturnToTask":
                    if (await Task(n.TaskId) is { } back) (name, _) = back;
                    break;
                case "FocusTarget" or "BreakEnd":
                    var focus = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == n.UserId && x.Id == n.SourceId, ct);
                    if (focus is null) break;
                    focusSeconds = FocusLifecycle.Settings(focus).WorkSeconds;
                    var taskId = await db.WorkSessions.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == focus.WorkSessionId)
                        .Select(x => x.TaskId).SingleOrDefaultAsync(ct);
                    if (await Task(taskId) is { } focused) (name, _) = focused;
                    break;
                case "Custom":
                    name = await db.CustomReminders.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == n.SourceId)
                        .Select(x => x.Title).SingleOrDefaultAsync(ct);
                    break;
                case "SpecialDay":
                    var day = await db.SpecialDays.AsNoTracking().Where(x => x.UserId == n.UserId && x.Id == n.SourceId)
                        .Select(x => new { x.Title, x.Kind }).SingleOrDefaultAsync(ct);
                    name = day?.Title; specialKind = day?.Kind.ToString();
                    break;
            }
            return MobilePushText.Build(new(n.Kind, name, note, n.OccurredAt, now, zone, starts, ends, rangeEnd, focusSeconds, specialKind));
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            return new(MobilePushText.GenericTitle, MobilePushText.GenericBody);
        }
    }
}
