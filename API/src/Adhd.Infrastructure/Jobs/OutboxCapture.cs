using System.Text.Json;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Adhd.Infrastructure.Preferences;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

internal static class OutboxCapture
{
    internal static void Append(PlannerDbContext db, DateTimeOffset timestamp)
    {
        var now = new DateTimeOffset(timestamp.UtcTicks / 10 * 10, TimeSpan.Zero); var entries = db.ChangeTracker.Entries().Where(x => x.State is EntityState.Added or EntityState.Modified).ToArray();
        var held = db.ChangeTracker.Entries<OutboxMessage>().Select(x => (x.Entity.UserId, x.Entity.EventKey)).ToHashSet();
        void Add(Guid user, string kind, Guid source, long version, string key, object payload)
        {
            if (!held.Add((user, key))) return;
            db.Outbox.Add(new() { Id = Guid.CreateVersion7(), UserId = user, Kind = kind, SourceId = source, SourceVersion = version, EventKey = key,
                Payload = JsonSerializer.Serialize(payload, RevisionWriter.Json), OccurredAt = now, AvailableAt = now });
        }
        foreach (var entry in entries)
        {
            switch (entry.Entity)
            {
                case MatrixState m when entry.State == EntityState.Modified:
                    Add(m.UserId, "MatrixChanged", m.UserId, m.Version, $"matrix:v{m.Version}", new { m.Version }); break;
                case TaskEvent e when entry.State == EntityState.Added:
                    Add(e.UserId, "TaskChanged", e.TaskId, e.Sequence, $"task-event:{e.Id}", new { e.TaskId, e.Type, e.Sequence }); break;
                case PlanRevision r when entry.State == EntityState.Added:
                    Add(r.UserId, "PlanChanged", r.Id, r.Number, $"revision:{r.Id}", new { r.DailyPlanId, revisionId = r.Id, r.ChangeSetId }); break;
                case DayItem d:
                    Add(d.UserId, "DayItemChanged", d.Id, d.Version, $"day-item:{d.Id}:v{d.Version}", new { dayItemId = d.Id, d.LocalDate, d.Version }); break;
                case TaskSchedule s when entry.State == EntityState.Modified && entry.Property(nameof(TaskSchedule.CompletedAt)).IsModified:
                    Add(s.UserId, "DayItemChanged", s.Id, s.Version, $"schedule-completion:{s.Id}:v{s.Version}", new { scheduleId = s.Id, s.DailyPlanId, s.Version }); break;
                case WorkSession w:
                    Add(w.UserId, "WorkChanged", w.Id, w.Version, $"work:{w.Id}:v{w.Version}", new { workSessionId = w.Id, w.TaskId, w.Version }); break;
                case FocusSession f:
                    Add(f.UserId, "FocusChanged", f.Id, f.Version, $"focus:{f.Id}:v{f.Version}", new { focusSessionId = f.Id, f.WorkSessionId, f.Version });
                    if (f.TargetReachedAt.HasValue && (entry.State == EntityState.Added || entry.Property(nameof(FocusSession.TargetReachedAt)).OriginalValue is null))
                        Add(f.UserId, "FocusTargetReached", f.Id, 0, $"focus:{f.Id}:target", new { focusSessionId = f.Id, f.TargetReachedAt, f.TargetObservedAt });
                    break;
                case RecurrenceTemplate t:
                    Add(t.UserId, "RecurrenceChanged", t.Id, t.Version, $"recurrence:{t.Id}:v{t.Version}", new { templateId = t.Id, t.Version }); break;
                case Adhd.Domain.SpecialDays.SpecialDay sd:
                    Add(sd.UserId, "SpecialDayChanged", sd.Id, sd.Version, $"special-day:{sd.Id}:v{sd.Version}", new { specialDayId = sd.Id, sd.Version }); break;
                case UserPreferencesRecord p:
                    Add(p.UserId, "PreferencesChanged", p.UserId, p.Version, $"preferences:v{p.Version}", new { p.Version }); break;
                case Adhd.Domain.Users.UserPlanningState s when entry.State == EntityState.Modified && entry.Property(nameof(s.NotesVersion)).IsModified:
                    Add(s.UserId, "NotesChanged", s.UserId, s.NotesVersion, $"notes:v{s.NotesVersion}", new { version = s.NotesVersion }); break;
                case NotificationIntent n when n.State == NotificationIntentState.Pending && (entry.State == EntityState.Added || entry.Property(nameof(NotificationIntent.SnoozeCount)).IsModified || entry.Property(nameof(NotificationIntent.RevisionId)).IsModified):
                    var notificationKey = $"notification:{n.Id}:snooze:{n.SnoozeCount}:revision:{n.RevisionId}";
                    Add(n.UserId, "NotificationReady", n.Id, n.SnoozeCount, notificationKey, new { notificationId = n.Id });
                    var readyMessage = db.Outbox.Local.SingleOrDefault(x => x.UserId == n.UserId && x.EventKey == notificationKey);
                    if (readyMessage is not null && n.NotBefore > now) readyMessage.AvailableAt = n.NotBefore.Value;
                    break;
                case Adhd.Domain.Notifications.PushDelivery d when entry.State == EntityState.Added:
                    Add(d.UserId, "PushDelivery", d.Id, d.SnoozeCount, $"push:{d.Id}", new { deliveryId = d.Id }); break;
                case Adhd.Domain.Notifications.NotificationPreferences np:
                    Add(np.UserId, "NotificationPreferencesChanged", np.UserId, np.Version, $"notification-preferences:v{np.Version}", new { np.Version }); break;
            }
        }
    }
}
