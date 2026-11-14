using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed class MobilePushStore(PlannerDbContext db, IMobilePushTokenProtector protector, IFcmTransport fcm,
    MobilePushEligibility eligibility, TimeProvider clock) : IMobilePushStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public async Task<MobilePushDeviceView> GetAsync(Guid user, Guid session, Guid installation, CancellationToken ct) =>
        View(await Owned(user, session, installation, ct));

    public async Task<MobilePushDeviceView> RegisterAsync(Guid user, Guid session, Guid installation, RegisterMobilePushDevice command, string key, CancellationToken ct)
    {
        Owner(user, command.ExpectedUserId);
        if (installation == Guid.Empty || string.IsNullOrWhiteSpace(command.FcmToken) || command.FcmToken.Length > 4096
            || command.FcmToken.Any(char.IsWhiteSpace) || command.FcmToken.Any(char.IsControl) || command.ClientSequence < 1 || command.BindingVersion < 0
            || command.Platform != "android" || command.PackageName != "tr.com.navortal"
            || command.Permission is not ("granted" or "denied" or "notDetermined") || string.IsNullOrWhiteSpace(command.AppVersion)
            || command.AppVersion.Length > 32 || command.BuildNumber < 1 || command.OsVersion is null || command.OsVersion.Length > 64)
            throw Invalid("mobile_device_invalid");
        var tokenHash = Hash(command.FcmToken); var hash = Hash(JsonSerializer.Serialize(command, Json));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await InstallationLock(installation, tokenHash, ct); await Lock(user, ct); await Session(user, session, ct);
        var row = await db.MobilePushDevices.SingleOrDefaultAsync(x => x.InstallationId == installation, ct);
        var replay = await Replay<MobilePushDeviceView>(user, "mobile-device:" + installation.ToString("N"), key, hash, ct);
        if (replay is not null)
        {
            if (row?.UserId != user || row.SessionId != session || row.BindingVersion != replay.BindingVersion || row.ClientSequence != replay.ClientSequence)
                throw Conflict("mobile_binding_conflict");
            return View(row);
        }
        if (row is not null && command.ClientSequence == row.ClientSequence && row.UserId == user && row.SessionId == session && row.RequestHash == hash)
            return View(row);
        if (command.BindingVersion != (row?.BindingVersion ?? 0) || row is not null && command.ClientSequence <= row.ClientSequence)
            throw Conflict("mobile_binding_conflict");
        if (row is not null && row.UserId != user && row.TokenHash is not null && row.TokenHash != tokenHash)
            throw Conflict("fcm_token_owned");
        if (await db.MobilePushDevices.AnyAsync(x => x.TokenHash == tokenHash && x.InstallationId != installation, ct))
            throw Conflict("fcm_token_owned");
        if (command.Permission == "granted" && command.RemindersChannelEnabled && (row is null || row.UserId != user || !row.Active)
            && await db.MobilePushDevices.CountAsync(x => x.UserId == user && x.Active, ct) >= 20)
            throw Invalid("mobile_device_limit");
        var now = clock.GetUtcNow();
        if (row is null)
        {
            row = new() { InstallationId = installation, CreatedAt = now, Version = 0 }; db.MobilePushDevices.Add(row);
        }
        else if (row.UserId != user || row.SessionId != session || row.TokenHash != tokenHash || !row.Active)
            row.BindingVersion++;
        row.UserId = user; row.SessionId = session; row.ProtectedToken = protector.Protect(command.FcmToken); row.TokenHash = tokenHash;
        row.ClientSequence = command.ClientSequence; row.RequestHash = hash; row.Permission = command.Permission;
        row.RemindersChannelEnabled = command.RemindersChannelEnabled; row.AppVersion = command.AppVersion;
        row.BuildNumber = command.BuildNumber; row.OsVersion = command.OsVersion;
        row.Active = command.Permission == "granted" && command.RemindersChannelEnabled; row.LastSeenAt = now; row.Version++;
        var result = View(row); Remember(user, "mobile-device:" + installation.ToString("N"), key, hash, result);
        await Save(ct); await tx.CommitAsync(ct); return result;
    }

    public async Task RemoveAsync(Guid user, Guid session, Guid installation, RemoveMobilePushDevice command, string key, CancellationToken ct)
    {
        Owner(user, command.ExpectedUserId);
        if (command.BindingVersion < 1 || command.ClientSequence < 1) throw Invalid("mobile_device_invalid");
        var hash = Hash(JsonSerializer.Serialize(command, Json));
        await using var tx = await db.Database.BeginTransactionAsync(ct); await InstallationLock(installation, null, ct); await Lock(user, ct);
        var row = await Owned(user, session, installation, ct);
        if (row.BindingVersion != command.BindingVersion) throw Conflict("mobile_binding_conflict");
        if (await Replay<RemovalReplay>(user, "mobile-remove:" + installation.ToString("N"), key, hash, ct) is not null) return;
        if (command.ClientSequence < row.ClientSequence || command.ClientSequence == row.ClientSequence && row.Active)
            throw Conflict("mobile_binding_conflict");
        row.Active = false; row.ProtectedToken = null; row.TokenHash = null; row.ClientSequence = command.ClientSequence; row.Version++;
        Remember(user, "mobile-remove:" + installation.ToString("N"), key, hash, new RemovalReplay(true));
        await Save(ct); await tx.CommitAsync(ct);
    }

    public async Task<MobilePushPreferencesView> PreferencesAsync(Guid user, CancellationToken ct)
    {
        var row = await db.MobilePushPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct);
        return new(row?.Enabled ?? true, row?.Version ?? 0, fcm.Available);
    }
    public async Task<MobilePushPreferencesView> UpdatePreferencesAsync(Guid user, UpdateMobilePushPreferences command, string key, CancellationToken ct)
    {
        Owner(user, command.ExpectedUserId); if (command.Version < 0) throw Invalid("mobile_preferences_invalid");
        var hash = Hash(JsonSerializer.Serialize(command, Json));
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var replay = await Replay<MobilePushPreferencesView>(user, "mobile-preferences", key, hash, ct); if (replay is not null) return replay;
        var row = await db.MobilePushPreferences.SingleOrDefaultAsync(x => x.UserId == user, ct);
        if ((row?.Version ?? 0) != command.Version) throw Conflict("version_conflict");
        if (row is null) { row = new() { UserId = user, Version = 0 }; db.MobilePushPreferences.Add(row); }
        row.Enabled = command.Enabled; row.Version++;
        var result = new MobilePushPreferencesView(row.Enabled, row.Version, fcm.Available); Remember(user, "mobile-preferences", key, hash, result);
        await Save(ct); await tx.CommitAsync(ct); return result;
    }

    public async Task<MobilePushDisplayView> DisplayAsync(Guid user, Guid session, Guid delivery, Guid installation, long bindingVersion, CancellationToken ct)
    {
        var row = await db.MobilePushDeliveries.AsNoTracking().SingleOrDefaultAsync(x => x.Id == delivery && x.UserId == user && x.InstallationId == installation && x.BindingVersion == bindingVersion, ct) ?? throw Missing();
        _ = await Owned(user, session, installation, ct);
        var reason = await eligibility.ReasonAsync(row, ct);
        if (reason == "ready" && row.State is not (MobilePushDeliveryState.Sending or MobilePushDeliveryState.Accepted or MobilePushDeliveryState.Unknown)) reason = "not_sent";
        var silent = true;
        if (reason == "ready")
        {
            var n = await db.NotificationIntents.AsNoTracking().SingleAsync(x => x.Id == row.NotificationId && x.UserId == user, ct);
            var settings = NotificationStore.Settings(await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct));
            silent = !await NotificationSources.SoundEnabled(db, n, settings, ct);
        }
        return new(row.Id, row.NotificationId, row.SnoozeCount, reason == "ready", reason, clock.GetUtcNow(), row.ExpiresAt, silent);
    }
    public async Task ReceiptAsync(Guid user, Guid session, Guid delivery, MobilePushReceipt command, CancellationToken ct)
    {
        Owner(user, command.ExpectedUserId);
        if (command.Stage is not ("Displayed" or "Opened") || command.SnoozeCount < 0) throw Invalid("mobile_receipt_invalid");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var device = await Owned(user, session, command.InstallationId, ct);
        if (device.BindingVersion != command.BindingVersion) throw Conflict("mobile_binding_conflict");
        var row = await db.MobilePushDeliveries.SingleOrDefaultAsync(x => x.UserId == user && x.Id == delivery
            && x.InstallationId == command.InstallationId && x.BindingVersion == command.BindingVersion && x.SnoozeCount == command.SnoozeCount, ct) ?? throw Missing();
        if (row.State is not (MobilePushDeliveryState.Sending or MobilePushDeliveryState.Accepted or MobilePushDeliveryState.Unknown))
            throw Invalid("mobile_receipt_invalid");
        if (command.Stage == "Displayed") row.DisplayedAt ??= clock.GetUtcNow(); else row.OpenedAt ??= clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }

    private sealed record RemovalReplay(bool Removed);
    private MobilePushDeviceView View(MobilePushDevice d) => new(d.InstallationId, d.UserId, d.BindingVersion, d.ClientSequence, d.Version,
        d.Active, d.Permission, d.RemindersChannelEnabled, "android", "tr.com.navortal", d.AppVersion, d.BuildNumber, d.OsVersion, d.LastSeenAt, fcm.Available);
    private async Task<MobilePushDevice> Owned(Guid user, Guid session, Guid installation, CancellationToken ct) =>
        await db.MobilePushDevices.SingleOrDefaultAsync(x => x.UserId == user && x.SessionId == session && x.InstallationId == installation, ct) ?? throw Missing();
    private async Task Session(Guid user, Guid session, CancellationToken ct)
    {
        var row = await db.AuthSessions.FromSqlInterpolated($"SELECT * FROM auth_sessions WHERE \"Id\"={session} AND \"UserId\"={user} FOR SHARE").SingleOrDefaultAsync(ct);
        if (row is null || row.RevokedAt is not null)
            throw new UseCaseException(ErrorKind.Unauthenticated, "unauthorized", "Oturum sona ermiş.");
    }
    private async Task Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { throw Conflict("mobile_binding_conflict"); }
        catch (DbUpdateException e) when (e.InnerException is Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.UniqueViolation })
        { throw Conflict("fcm_token_owned"); }
    }
    private async Task Lock(Guid user, CancellationToken ct) => _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={user} FOR UPDATE").SingleAsync(ct);
    private async Task InstallationLock(Guid installation, string? tokenHash, CancellationToken ct)
    {
        var keys = new[] { "mobile-installation:" + installation, tokenHash is null ? null : "mobile-token:" + tokenHash };
        foreach (var k in keys.Where(x => x is not null).Select(x => System.Buffers.Binary.BinaryPrimitives.ReadInt64BigEndian(SHA256.HashData(Encoding.UTF8.GetBytes(x!)))).Order())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({k})", ct);
    }
    private async Task<T?> Replay<T>(Guid user, string scope, string key, string hash, CancellationToken ct) where T : class
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required");
        var row = await db.IdempotencyRecords.SingleOrDefaultAsync(x => x.UserId == user && x.Scope == scope && x.Key == key, ct);
        if (row is null) return null;
        if (row.CreatedAt <= clock.GetUtcNow().AddHours(-24)) { db.IdempotencyRecords.Remove(row); return null; }
        if (row.RequestHash != hash) throw Conflict("idempotency_conflict");
        return JsonSerializer.Deserialize<T>(row.Response, Json)!;
    }
    private void Remember<T>(Guid user, string scope, string key, string hash, T result) => db.IdempotencyRecords.Add(new IdempotencyRecord
    { UserId = user, Scope = scope, Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(result, Json), CreatedAt = clock.GetUtcNow() });
    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static void Owner(Guid user, Guid expected) { if (user != expected) throw Missing(); }
    private static UseCaseException Missing() => new(ErrorKind.NotFound, "mobile_device_not_found", "Mobil kayıt bulunamadı.");
    private static UseCaseException Invalid(string code) => new(ErrorKind.Validation, code, "Mobil bildirim isteğini kontrol et.");
    private static UseCaseException Conflict(string code) => new(ErrorKind.Conflict, code, "Mobil kayıt değişmiş; güncel durumu kontrol et.");
}
