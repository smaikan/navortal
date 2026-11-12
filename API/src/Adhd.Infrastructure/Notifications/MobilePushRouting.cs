using Adhd.Application.Notifications;
using Adhd.Application.Preferences;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Adhd.Infrastructure.Notifications;

public sealed class MobilePushEligibility(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock)
{
    internal async Task<string> ReasonAsync(MobilePushDelivery d, CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var device = await db.MobilePushDevices.AsNoTracking().SingleOrDefaultAsync(x => x.InstallationId == d.InstallationId, ct);
        if (device is null || device.UserId != d.UserId || device.BindingVersion != d.BindingVersion || !device.Active
            || device.Permission != "granted" || !device.RemindersChannelEnabled || device.ProtectedToken is null) return "device_inactive";
        if (!await db.AuthSessions.AsNoTracking().AnyAsync(x => x.UserId == d.UserId && x.Id == device.SessionId && x.RevokedAt == null, ct)) return "session_revoked";
        if (await db.MobilePushPreferences.AnyAsync(x => x.UserId == d.UserId && !x.Enabled, ct)) return "mobile_disabled";
        var n = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Id == d.NotificationId && x.UserId == d.UserId, ct);
        if (n.ReadAt.HasValue) return "read";
        if (n.SnoozeCount != d.SnoozeCount) return "snoozed";
        if (n.State != NotificationIntentState.Ready || !await NotificationSources.Valid(db, n, now, ct)) return "obsolete";
        var settings = NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == d.UserId, ct));
        if (!NotificationPolicy.Allows(settings, n.Kind)) return "disabled";
        if (now >= d.ExpiresAt || now - NotificationSources.Due(n, settings) > TimeSpan.FromMinutes(2)) return "expired";
        if (now < NotificationSources.Due(n, settings)) return "not_due";
        if (NotificationPolicy.QuietUntil(settings, (await preferences.ReadAsync(d.UserId, ct)).Values.TimeZoneId, now).HasValue) return "quiet_hours";
        return "ready";
    }
}

public sealed class MobilePushRouter(PlannerDbContext db, IFcmTransport fcm, IOptions<PushSettings> web, TimeProvider clock)
{
    // Caller holds the user's planning lock, so route selection and its outbox records commit together.
    internal async Task PrepareAsync(NotificationIntent n, NotificationSettings settings, CancellationToken ct)
    {
        if (await db.MobilePushRoutes.AnyAsync(x => x.UserId == n.UserId && x.NotificationId == n.Id && x.SnoozeCount == n.SnoozeCount, ct)) return;
        var device = fcm.Available ? await BestDeviceAsync(n.UserId, null, ct) : null;
        // Mobil ve web bağımsız kanallardır: uygun mobil cihaz varsa telefona, açık web aboneliği varsa masaüstüne de gider.
        // Web kendi koşullarını (sunucu ayarı, pushEnabled, aktif abonelik) PrepareWebAsync içinde kendisi denetler.
        db.MobilePushRoutes.Add(new() { UserId = n.UserId, NotificationId = n.Id, SnoozeCount = n.SnoozeCount, Channel = device is null ? "Web" : "Both" });
        await PrepareWebAsync(n, settings, ct);
        if (device is null) return;
        AddDelivery(n.UserId, n.Id, n.SnoozeCount, 1, device, NotificationSources.Due(n, settings).AddMinutes(2));
    }
    // fcm_unregistered sonrası: web'e geçmeden önce sıradaki aktif cihazı bir kez dene (aynı ExpiresAt).
    internal async Task RetryNextOrFallbackAsync(MobilePushDelivery failed, CancellationToken ct)
    {
        if (failed.Attempt == 1 && failed.LastErrorCode == "fcm_unregistered" && fcm.Available && clock.GetUtcNow() < failed.ExpiresAt
            && await BestDeviceAsync(failed.UserId, failed.InstallationId, ct) is { } next)
        {
            AddDelivery(failed.UserId, failed.NotificationId, failed.SnoozeCount, 2, next, failed.ExpiresAt);
            return;
        }
        await FallbackAsync(failed, ct);
    }
    private async Task<MobilePushDevice?> BestDeviceAsync(Guid user, Guid? exclude, CancellationToken ct)
    {
        if (await db.MobilePushPreferences.AnyAsync(x => x.UserId == user && !x.Enabled, ct)) return null;
        return await (from d in db.MobilePushDevices.AsNoTracking()
            join s in db.AuthSessions.AsNoTracking() on d.SessionId equals s.Id
            where d.UserId == user && d.Active && d.ProtectedToken != null && d.Permission == "granted" && d.RemindersChannelEnabled
                && s.UserId == user && s.RevokedAt == null && (exclude == null || d.InstallationId != exclude)
            orderby d.LastSeenAt descending, d.InstallationId
            select d).FirstOrDefaultAsync(ct);
    }
    private void AddDelivery(Guid user, Guid notification, int snooze, int attempt, MobilePushDevice device, DateTimeOffset expiresAt)
    {
        var now = clock.GetUtcNow();
        var delivery = new MobilePushDelivery { Id = Guid.CreateVersion7(), UserId = user, NotificationId = notification, SnoozeCount = snooze, Attempt = attempt,
            InstallationId = device.InstallationId, BindingVersion = device.BindingVersion, CreatedAt = now, ExpiresAt = expiresAt };
        db.MobilePushDeliveries.Add(delivery);
        db.Outbox.Add(new() { Id = Guid.CreateVersion7(), UserId = user, Kind = "MobilePushDelivery", SourceId = delivery.Id,
            SourceVersion = snooze, EventKey = "mobile-push:" + delivery.Id.ToString("N"), Payload = "{}", OccurredAt = now, AvailableAt = now });
    }
    internal async Task FallbackAsync(MobilePushDelivery delivery, CancellationToken ct)
    {
        var route = await db.MobilePushRoutes.SingleAsync(x => x.UserId == delivery.UserId && x.NotificationId == delivery.NotificationId && x.SnoozeCount == delivery.SnoozeCount, ct);
        if (route.Channel != "Mobile" || delivery.State != MobilePushDeliveryState.Rejected) return;
        route.Channel = "Web";
        var n = await db.NotificationIntents.SingleAsync(x => x.UserId == delivery.UserId && x.Id == delivery.NotificationId, ct);
        if (n.SnoozeCount != delivery.SnoozeCount || n.ReadAt.HasValue || n.State != NotificationIntentState.Ready) return;
        var settings = NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == delivery.UserId, ct));
        await PrepareWebAsync(n, settings, ct);
    }
    private async Task PrepareWebAsync(NotificationIntent n, NotificationSettings settings, CancellationToken ct)
    {
        if (!web.Value.Enabled || !settings.PushEnabled) return;
        var now = clock.GetUtcNow();
        var subscriptions = await db.PushSubscriptions.AsNoTracking().Where(x => x.UserId == n.UserId && x.Active && (x.ExpiresAt == null || x.ExpiresAt > now)).ToArrayAsync(ct);
        var existing = await db.PushDeliveries.Where(x => x.UserId == n.UserId && x.NotificationId == n.Id && x.SnoozeCount == n.SnoozeCount).Select(x => x.SubscriptionId).ToArrayAsync(ct);
        foreach (var s in subscriptions.Where(x => !existing.Contains(x.Id)))
            db.PushDeliveries.Add(new() { Id = Guid.CreateVersion7(), UserId = n.UserId, NotificationId = n.Id, SubscriptionId = s.Id, SnoozeCount = n.SnoozeCount, CreatedAt = now });
    }
}
