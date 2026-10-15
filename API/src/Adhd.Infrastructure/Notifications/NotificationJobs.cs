using Adhd.Application.Jobs;
using Adhd.Application.Notifications;
using Adhd.Application.Preferences;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Notifications;

public sealed class NotificationJobs(PlannerDbContext db, IPreferencesStore preferences, IPushTransport transport, IOptions<PushSettings> push, TimeProvider clock) : INotificationJobs
{
    public async Task<bool> HandleAsync(OutboxClaim claim, CancellationToken ct) => claim.Kind == "NotificationReady" ? await Ready(claim, ct) : await Deliver(claim, ct);
    private async Task<bool> Ready(OutboxClaim claim, CancellationToken ct)
    {
        var now = clock.GetUtcNow(); await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(claim, ct);
        var n = await db.NotificationIntents.SingleOrDefaultAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
        if (n is null || n.SnoozeCount != claim.SourceVersion || n.State is NotificationIntentState.Obsolete or NotificationIntentState.Suppressed or NotificationIntentState.Expired) return true;
        if (n.State == NotificationIntentState.Ready) return false;
        var settings = await Settings(claim.UserId, ct);
        var validSource = await NotificationSources.Valid(db, n, now, ct);
        if (!validSource) n.State = NotificationIntentState.Obsolete;
        else if (!NotificationPolicy.Allows(settings, n.Kind)) n.State = NotificationIntentState.Suppressed;
        else if (now - Due(n, settings) > TimeSpan.FromMinutes(2)) n.State = NotificationIntentState.Expired;
        else
        {
            var until = await DeferredUntil(n, settings, now, ct); if (until.HasValue) throw new JobDeferredException(until.Value);
            if (n.State == NotificationIntentState.Pending) { n.State = NotificationIntentState.Ready; n.ReadyAt ??= now; n.Version++; }
            if (settings.PushEnabled && push.Value.Enabled)
            {
                var subscriptions = await db.PushSubscriptions.AsNoTracking().Where(x => x.UserId == n.UserId && x.Active && (x.ExpiresAt == null || x.ExpiresAt > now)).ToArrayAsync(ct);
                var existing = await db.PushDeliveries.Where(x => x.UserId == n.UserId && x.NotificationId == n.Id && x.SnoozeCount == n.SnoozeCount).Select(x => x.SubscriptionId).ToArrayAsync(ct);
                foreach (var s in subscriptions.Where(x => !existing.Contains(x.Id))) db.PushDeliveries.Add(new() { Id = Guid.CreateVersion7(), UserId = n.UserId, NotificationId = n.Id, SubscriptionId = s.Id, SnoozeCount = n.SnoozeCount, CreatedAt = now });
            }
        }
        if (validSource && n.Kind == "Custom") await ScheduleNext(n, now, ct);
        var obsolete = n.State != NotificationIntentState.Ready; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return obsolete;
    }
    private async Task ScheduleNext(NotificationIntent n, DateTimeOffset now, CancellationToken ct)
    {
        var row = await db.CustomReminders.SingleAsync(x => x.UserId == n.UserId && x.Id == n.SourceId, ct);
        if (NotificationStore.ReadRepeat(row) is not { } repeat) return;
        if (await db.NotificationIntents.AnyAsync(x => x.UserId == n.UserId && x.SourceId == row.Id && x.Kind == "Custom" && x.SourceVersion == row.Version && x.OccurredAt > now && x.OccurredAt > n.OccurredAt && x.State == NotificationIntentState.Pending, ct)) return;
        var at = ReminderRepeatRules.Next(repeat, now > n.OccurredAt ? now : n.OccurredAt);
        row.NextDueAt = at;
        var key = $"custom:{row.Id}:v{row.Version}:at:{at.UtcTicks}";
        if (await db.NotificationIntents.AnyAsync(x => x.UserId == n.UserId && x.SourceKey == key, ct)) return;
        db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = n.UserId, Kind = "Custom", Title = row.Title, SourceKey = key, SourceId = row.Id, SourceVersion = row.Version, TaskId = row.TaskId, OccurredAt = at, NotBefore = at, CreatedAt = now });
    }
    private async Task<bool> Deliver(OutboxClaim claim, CancellationToken ct)
    {
        PushDelivery delivery; PushSubscriptionRecord subscription; NotificationIntent n; NotificationSettings settings;
        NotificationMessage presentation;
        var now = clock.GetUtcNow();
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await Lock(claim, ct); delivery = await db.PushDeliveries.SingleAsync(x => x.UserId == claim.UserId && x.Id == claim.SourceId, ct);
            if (delivery.State != DeliveryState.Pending) return delivery.State != DeliveryState.Succeeded;
            n = await db.NotificationIntents.SingleAsync(x => x.UserId == claim.UserId && x.Id == delivery.NotificationId, ct);
            subscription = await db.PushSubscriptions.SingleAsync(x => x.UserId == claim.UserId && x.Id == delivery.SubscriptionId, ct); settings = await Settings(claim.UserId, ct);
            var valid = push.Value.Enabled && settings.PushEnabled && NotificationPolicy.Allows(settings, n.Kind) && subscription.Active && (subscription.ExpiresAt is null || subscription.ExpiresAt > now) && n.State == NotificationIntentState.Ready && n.SnoozeCount == delivery.SnoozeCount && await NotificationSources.Valid(db, n, now, ct);
            if (!valid || now - Due(n, settings) > TimeSpan.FromMinutes(2))
            {
                delivery.State = DeliveryState.Obsolete; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
            }
            var until = await DeferredUntil(n, settings, now, ct); if (until.HasValue) throw new JobDeferredException(until.Value);
            presentation = await NotificationPresentationReader.Read(db, n, now, ct);
            await tx.CommitAsync(ct);
        }
        // Dış servise gitmeden hemen önce kaynağı ve kuralı kontrol et. Ağda beklerken hesap kilidi tutma.
        var sound = await NotificationSources.SoundEnabled(db, n, settings, ct);
        var envelope = new PushEnvelope(n.Id, n.UserId, $"notification:{n.Id:D}", presentation.Title, presentation.Body, $"/notifications/{n.Id:D}", !sound, n.SnoozeCount, NotificationSounds.For(settings, n.Kind));
        var result = await transport.SendAsync(subscription, envelope, ct);
        if (result.StatusCode == 429 || result.StatusCode >= 500)
        {
            var wait = result.RetryAfter ?? JobRetry.Delay(claim.Attempts); wait = TimeSpan.FromSeconds(Math.Clamp(wait.TotalSeconds, 1, 3600));
            throw new JobDeferredException(clock.GetUtcNow().Add(wait), countAttempt: true);
        }
        await using var finish = await db.Database.BeginTransactionAsync(ct); await Lock(claim, ct);
        await db.Entry(delivery).ReloadAsync(ct); delivery.LastStatusCode = result.StatusCode;
        if (result.StatusCode is 404 or 410)
        {
            await db.Entry(subscription).ReloadAsync(ct); subscription.Active = false; subscription.Version++; delivery.State = DeliveryState.InvalidSubscription;
        }
        else if (result.StatusCode is >= 200 and < 300) { delivery.State = DeliveryState.Succeeded; delivery.DeliveredAt = clock.GetUtcNow(); }
        else delivery.State = DeliveryState.Rejected;
        await db.SaveChangesAsync(ct); await finish.CommitAsync(ct); return delivery.State != DeliveryState.Succeeded;
    }
    private async Task<NotificationSettings> Settings(Guid user, CancellationToken ct) => NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct));
    private static DateTimeOffset Due(NotificationIntent n, NotificationSettings s) => NotificationSources.Due(n, s);
    private async Task<DateTimeOffset?> DeferredUntil(NotificationIntent n, NotificationSettings settings, DateTimeOffset now, CancellationToken ct)
    {
        var due = Due(n, settings); if (due > now) return due;
        return NotificationPolicy.QuietUntil(settings, (await preferences.ReadAsync(n.UserId, ct)).Values.TimeZoneId, now);
    }
    private async Task Lock(OutboxClaim c, CancellationToken ct)
    {
        _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={c.UserId} FOR UPDATE").SingleAsync(ct);
        var now = clock.GetUtcNow(); if (!await db.Outbox.AsNoTracking().AnyAsync(x => x.UserId == c.UserId && x.Id == c.Id && x.State == OutboxState.Processing && x.LeaseId == c.LeaseId && x.LeaseUntil > now, ct))
            throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Conflict, "job_lease_lost", "İş sahipliği değişmiş.");
    }
}
