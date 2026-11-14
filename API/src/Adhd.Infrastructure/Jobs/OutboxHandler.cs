using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Jobs;
using Adhd.Domain.Focus;
using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Support;
using Adhd.Infrastructure.Focus;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

public sealed partial class OutboxHandler(PlannerDbContext db, Adhd.Application.Recurrence.IRecurrenceStore recurrence, Adhd.Application.Notifications.INotificationJobs notifications, TimeProvider clock) : IOutboxHandler
{
    public async Task<bool> HandleAsync(OutboxClaim claim, CancellationToken ct)
    {
        if (claim.Kind is "RecurrenceChanged" or "RecurrenceWindow") return await Recurrence(claim, ct);
        if (claim.Kind is "NotificationReady" or "PushDelivery" or "MobilePushDelivery") return await notifications.HandleAsync(claim, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(claim.UserId, ct); await Lease(claim, ct);
        var receipt = await db.JobEffects.SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.OutboxId == claim.Id, ct);
        if (receipt is not null && receipt.State != JobEffectState.Prepared) return receipt.State == JobEffectState.Obsolete;
        var obsolete = claim.Kind switch
        {
            "PlanChanged" => await Plan(claim, ct),
            "TaskChanged" => await TaskChanged(claim, ct),
            "FocusTargetReached" => await FocusTarget(claim, ct),
            "WorkChanged" => await WorkChanged(claim, ct),
            "FocusChanged" => await FocusChanged(claim, ct),
            // Gün listesi değişince ekranları yenilemek yeterli. Hatırlatma çıkmaz
            "DayItemChanged" => false,
            "MatrixChanged" => false,
            // Özel gün değişince ekranı yenile. Hatırlatma zaten kayıt sırasında hazırlanır
            "SpecialDayChanged" => false,
            "NotesChanged" => false,
            "PreferencesChanged" => !await db.Preferences.AnyAsync(x => x.UserId == claim.UserId && x.Version == claim.SourceVersion, ct),
            "NotificationPreferencesChanged" => !await db.NotificationPreferences.AnyAsync(x => x.UserId == claim.UserId && x.Version == claim.SourceVersion, ct),
            _ => throw new UseCaseException(ErrorKind.Validation, "unknown_outbox_kind", "Bu arka plan iş türü desteklenmiyor.")
        };
        receipt ??= new() { OutboxId = claim.Id, UserId = claim.UserId, CreatedAt = clock.GetUtcNow() }; if (db.Entry(receipt).State == EntityState.Detached) db.JobEffects.Add(receipt);
        receipt.State = obsolete ? JobEffectState.Obsolete : JobEffectState.Completed; receipt.CompletedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return obsolete;
    }
    private async Task<bool> Plan(OutboxClaim claim, CancellationToken ct)
    {
        var revision = await db.PlanRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
        if (revision is null) return true;
        var plan = await db.DailyPlans.AsNoTracking().SingleAsync(x => x.UserId == claim.UserId && x.Id == revision.DailyPlanId, ct); if (plan.CurrentRevisionId != revision.Id) return true; var now = clock.GetUtcNow();
        await db.ReminderWork.Where(x => x.UserId == claim.UserId && x.DailyPlanId == plan.Id && x.RevisionId != revision.Id && x.State == ReminderState.Pending).ExecuteUpdateAsync(s => s.SetProperty(x => x.State, ReminderState.Obsolete).SetProperty(x => x.HandledAt, now), ct);
        await db.NotificationIntents.Where(x => x.UserId == claim.UserId && x.DailyPlanId == plan.Id && x.RevisionId != revision.Id && x.State == NotificationIntentState.Pending).ExecuteUpdateAsync(s => s.SetProperty(x => x.State, NotificationIntentState.Obsolete), ct);
        var settings = Adhd.Infrastructure.Notifications.NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId, ct));
        var blocks = await (from b in db.TaskSchedules.AsNoTracking() join t in db.Tasks.AsNoTracking() on new { b.UserId, Id = b.TaskId } equals new { t.UserId, Id = (Guid?)t.Id }
            where b.UserId == claim.UserId && b.DailyPlanId == plan.Id && b.Kind == ScheduleKind.Work && b.State == ScheduleState.Planned && b.EndsAt >= now.AddMinutes(-2)
                && t.ArchivedAt == null && !t.DirectWorkCompleted && (t.State == Adhd.Domain.Tasks.TaskState.Pending || t.State == Adhd.Domain.Tasks.TaskState.InProgress || t.State == Adhd.Domain.Tasks.TaskState.Paused)
            select b).ToArrayAsync(ct);
        var held = await db.ReminderWork.Where(x => x.UserId == claim.UserId && x.RevisionId == revision.Id).Select(x => x.SourceKey).ToArrayAsync(ct); var keys = held.ToHashSet();
        foreach (var block in blocks)
            foreach (var (kind, due) in new[] { (ReminderKind.ScheduleStart, block.StartsAt), (ReminderKind.ScheduleEnd, block.EndsAt) })
            {
                var key = $"revision:{revision.Id}:schedule:{block.Id}:{kind}"; if (!keys.Add(key)) continue;
                db.ReminderWork.Add(new() { Id = Guid.CreateVersion7(), UserId = claim.UserId, SourceKey = key, Kind = kind, SourceId = block.Id, SourceVersion = block.Version, TaskId = block.TaskId!.Value, DailyPlanId = plan.Id, RevisionId = revision.Id, SourceAt = due, DueAt = due.AddSeconds(-settings.LeadSeconds), CreatedAt = now });
            }
        return false;
    }
    private async Task<bool> TaskChanged(OutboxClaim claim, CancellationToken ct)
    {
        var task = await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct); if (task is null || task.Version != claim.SourceVersion) return true;
        var now = clock.GetUtcNow(); var open = SupportRules.Open(task);
        // Görev açık değilse onun bekleyen bütün hatırlatmaları geçersiz olur.
        await db.ReminderWork.Where(x => x.UserId == claim.UserId && x.TaskId == task.Id && x.State == ReminderState.Pending && !open)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, ReminderState.Obsolete).SetProperty(x => x.HandledAt, now), ct);
        await db.NotificationIntents.Where(x => x.UserId == claim.UserId && x.TaskId == task.Id && x.State == NotificationIntentState.Pending && !open)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, NotificationIntentState.Obsolete), ct);
        // Aralık bitişi hatırlatmaları görevin ve altındaki bütün görevlerin aralığına bağlı: üst aralık değişince veya görev taşınınca alt ağaç da yeniden hesaplanır.
        var all = await db.Tasks.AsNoTracking().Where(x => x.UserId == claim.UserId && x.ArchivedAt == null).ToArrayAsync(ct);
        var children = all.Where(x => x.ParentTaskId.HasValue).ToLookup(x => x.ParentTaskId!.Value);
        var subtree = new List<Adhd.Domain.Tasks.TaskItem>(); var seen = new HashSet<Guid>(); var queue = new Queue<Adhd.Domain.Tasks.TaskItem>([all.SingleOrDefault(x => x.Id == task.Id) ?? task]);
        while (queue.TryDequeue(out var node)) { if (!seen.Add(node.Id)) continue; subtree.Add(node); foreach (var child in children[node.Id]) queue.Enqueue(child); }
        var ranges = Adhd.Domain.Tasks.PlannedRanges.OwnOrInherited(all); var zone = await Adhd.Infrastructure.Tasks.TaskRangeReminders.Zone(db, claim.UserId, ct);
        var ids = subtree.Select(x => x.Id).ToArray();
        var pendingWork = await db.ReminderWork.Where(x => x.UserId == claim.UserId && ids.Contains(x.TaskId) && x.Kind == ReminderKind.TaskDeadline && x.State == ReminderState.Pending).ToArrayAsync(ct);
        var pendingIntents = await db.NotificationIntents.Where(x => x.UserId == claim.UserId && x.TaskId != null && ids.Contains(x.TaskId.Value) && x.Kind == "TaskDeadline" && x.State == NotificationIntentState.Pending).ToArrayAsync(ct);
        foreach (var node in subtree)
        {
            var instants = SupportRules.Open(node) && ranges.TryGetValue(node.Id, out var range) && range is { } r ? Adhd.Infrastructure.Tasks.TaskRangeReminders.Slots(r, zone) : [];
            foreach (var work in pendingWork.Where(x => x.TaskId == node.Id && !instants.Contains(new(x.SourceAt ?? x.DueAt, x.DueAt)))) { work.State = ReminderState.Obsolete; work.HandledAt = now; }
            foreach (var intent in pendingIntents.Where(x => x.TaskId == node.Id && !instants.Any(i => i.Occurs == x.OccurredAt && i.Due == (x.NotBefore ?? x.OccurredAt)))) intent.State = NotificationIntentState.Obsolete;
            foreach (var slot in instants.Where(x => x.Due >= now.AddMinutes(-2)))
            {
                var key = $"task:{node.Id}:range-end:{slot.Occurs.UtcTicks}:{slot.Due.UtcTicks}";
                if (!await db.ReminderWork.AnyAsync(x => x.UserId == claim.UserId && x.SourceKey == key, ct))
                    db.ReminderWork.Add(new() { Id = Guid.CreateVersion7(), UserId = claim.UserId, Kind = ReminderKind.TaskDeadline, SourceKey = key, SourceId = node.Id, SourceVersion = node.Version, TaskId = node.Id, SourceAt = slot.Occurs, DueAt = slot.Due, CreatedAt = now });
            }
        }
        return false;
    }
    private async Task<bool> FocusTarget(OutboxClaim claim, CancellationToken ct)
    {
        var focus = await db.FocusSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
        if (focus?.TargetReachedAt is null || focus.State is FocusState.Finished or FocusState.Interrupted || !FocusLifecycle.Settings(focus).NotificationsEnabled) return true;
        var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == claim.UserId && x.SessionId == focus.WorkSessionId).ToArrayAsync(ct);
        if (FocusRules.Measure(focus, FocusLifecycle.Settings(focus), segments, clock.GetUtcNow()).TargetInstant is null) return true;
        var taskId = await db.WorkSessions.Where(x => x.UserId == claim.UserId && x.Id == focus.WorkSessionId).Select(x => x.TaskId).SingleAsync(ct);
        var key = $"focus:{focus.Id}:target";
        if (!await db.NotificationIntents.AnyAsync(x => x.UserId == claim.UserId && x.SourceKey == key, ct))
            db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = claim.UserId, SourceKey = key, Kind = "FocusTarget", SourceId = focus.Id, TaskId = taskId, OccurredAt = focus.TargetReachedAt.Value, CreatedAt = clock.GetUtcNow() });
        return false;
    }
    private async Task Lease(OutboxClaim claim, CancellationToken ct)
    {
        var now = clock.GetUtcNow(); if (!await db.Outbox.AsNoTracking().AnyAsync(x => x.Id == claim.Id && x.UserId == claim.UserId && x.State == OutboxState.Processing && x.LeaseId == claim.LeaseId && x.LeaseUntil > now, ct)) throw new UseCaseException(ErrorKind.Conflict, "job_lease_lost", "İş sahipliği değişmiş.");
    }
    private async Task Lock(Guid userId, CancellationToken ct) => _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={userId} FOR UPDATE").SingleAsync(ct);
}
