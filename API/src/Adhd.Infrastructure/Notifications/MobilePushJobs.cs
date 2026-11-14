using System.Globalization;
using Adhd.Application.Common;
using Adhd.Application.Jobs;
using Adhd.Application.Notifications;
using Adhd.Application.Preferences;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed class MobilePushJobs(PlannerDbContext db, IFcmTransport transport, IMobilePushTokenProtector protector,
    MobilePushEligibility eligibility, MobilePushRouter router, IPreferencesStore preferences, TimeProvider clock)
{
    public async Task<bool> HandleAsync(OutboxClaim claim, CancellationToken ct)
    {
        MobilePushDelivery d; string token;
        await using (var tx = await db.Database.BeginTransactionAsync(ct))
        {
            await Lock(claim, ct);
            d = await db.MobilePushDeliveries.SingleAsync(x => x.Id == claim.SourceId && x.UserId == claim.UserId, ct);
            if (d.State == MobilePushDeliveryState.Sending)
            {
                // A process may have died after the provider accepted. Never create a second channel delivery.
                d.State = MobilePushDeliveryState.Unknown; d.LastErrorCode = "send_outcome_unknown";
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
            }
            if (d.State != MobilePushDeliveryState.Pending) return d.State != MobilePushDeliveryState.Accepted;
            var reason = await eligibility.ReasonAsync(d, ct);
            if (reason != "ready")
            {
                var noTarget = reason is "device_inactive" or "session_revoked" or "mobile_disabled";
                d.State = noTarget ? MobilePushDeliveryState.Rejected : MobilePushDeliveryState.Obsolete; d.LastErrorCode = reason;
                if (noTarget) await router.FallbackAsync(d, ct);
                await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
            }
            if (!transport.Available)
            {
                d.State = MobilePushDeliveryState.Rejected; d.LastErrorCode = "fcm_unavailable";
                await router.FallbackAsync(d, ct); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
            }
            var device = await db.MobilePushDevices.AsNoTracking().SingleAsync(x => x.InstallationId == d.InstallationId, ct);
            try { token = protector.Unprotect(device.ProtectedToken!); }
            catch (System.Security.Cryptography.CryptographicException)
            {
                d.State = MobilePushDeliveryState.Rejected; d.LastErrorCode = "fcm_token_unavailable";
                await router.FallbackAsync(d, ct); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return true;
            }
            d.State = MobilePushDeliveryState.Sending;
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        }
        var now = clock.GetUtcNow();
        var n = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Id == d.NotificationId && x.UserId == d.UserId, ct);
        var text = await MobilePushPresentationReader.Read(db, preferences, n, now, ct);
        var data = new Dictionary<string, string>
        {
            ["schemaVersion"] = "1", ["type"] = "notification.ready", ["deliveryId"] = d.Id.ToString("D"),
            ["notificationId"] = d.NotificationId.ToString("D"), ["recipientUserId"] = d.UserId.ToString("D"),
            ["bindingVersion"] = d.BindingVersion.ToString(CultureInfo.InvariantCulture), ["snoozeCount"] = d.SnoozeCount.ToString(CultureInfo.InvariantCulture),
            ["eventType"] = n.Kind, ["title"] = text.Title, ["body"] = text.Body,
            ["path"] = "/notifications/" + d.NotificationId.ToString("D"), ["dedupeKey"] = $"{d.UserId:D}:{d.NotificationId:D}:{d.SnoozeCount}",
            ["groupKey"] = "reminders", ["channelId"] = "reminders-v1", ["sentAt"] = now.ToString("O"), ["expiresAt"] = d.ExpiresAt.ToString("O")
        };
        FcmSendResult result;
        try { result = await transport.SendAsync(token, data, d.ExpiresAt - now, ct); }
        catch (Exception e) when (e is HttpRequestException or OperationCanceledException)
        {
            // The HTTP outcome is ambiguous. Persist Unknown on the next lease if this request was cancelled.
            result = new(0, "send_outcome_unknown");
        }
        await using var finish = await db.Database.BeginTransactionAsync(ct); await Lock(claim, ct);
        await db.Entry(d).ReloadAsync(ct);
        d.LastErrorCode = result.Code;
        if (result.StatusCode is >= 200 and < 300)
        { d.State = MobilePushDeliveryState.Accepted; d.ProviderAcceptedAt = clock.GetUtcNow(); }
        else if (result.InvalidToken || result.DefinitelyRejected)
        {
            d.State = MobilePushDeliveryState.Rejected;
            if (result.InvalidToken)
                await db.MobilePushDevices.Where(x => x.InstallationId == d.InstallationId && x.UserId == d.UserId && x.BindingVersion == d.BindingVersion)
                    .ExecuteUpdateAsync(s => s.SetProperty(x => x.Active, false).SetProperty(x => x.TokenHash, (string?)null)
                        .SetProperty(x => x.ProtectedToken, (string?)null).SetProperty(x => x.Version, x => x.Version + 1), ct);
            await router.FallbackAsync(d, ct);
        }
        else if (result.StatusCode == 429 || result.StatusCode >= 500)
        {
            d.State = MobilePushDeliveryState.Pending;
            await db.SaveChangesAsync(ct); await finish.CommitAsync(ct);
            var delay = result.RetryAfter ?? JobRetry.Delay(claim.Attempts);
            throw new JobDeferredException(clock.GetUtcNow().AddSeconds(Math.Clamp(delay.TotalSeconds, 1, 3600)), countAttempt: true);
        }
        else d.State = MobilePushDeliveryState.Unknown;
        await db.SaveChangesAsync(ct); await finish.CommitAsync(ct); return d.State != MobilePushDeliveryState.Accepted;
    }
    private async Task Lock(OutboxClaim c, CancellationToken ct)
    {
        _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={c.UserId} FOR UPDATE").SingleAsync(ct);
        var now = clock.GetUtcNow();
        if (!await db.Outbox.AsNoTracking().AnyAsync(x => x.Id == c.Id && x.UserId == c.UserId && x.State == OutboxState.Processing && x.LeaseId == c.LeaseId && x.LeaseUntil > now, ct))
            throw new UseCaseException(ErrorKind.Conflict, "job_lease_lost", "İş sahipliği değişmiş.");
    }
}
