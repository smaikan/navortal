using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Notifications;
using Adhd.Application.Preferences;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed partial class NotificationStore(PlannerDbContext db, TimeProvider clock, IPreferencesStore preferences) : INotificationStore
{
    internal static NotificationSettings Settings(NotificationPreferences? row) => row is null ? new() : JsonSerializer.Deserialize<NotificationSettings>(row.Settings, RevisionWriter.Json)!;
    public async Task<NotificationPreferencesView> PreferencesAsync(Guid user, CancellationToken ct)
    {
        var row = await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user, ct); return new(Settings(row), row?.Version ?? 0);
    }
    public async Task<NotificationPreferencesView> UpdatePreferencesAsync(Guid user, UpdateNotificationPreferences command, CancellationToken ct)
    {
        if (command.Settings is null || !NotificationPolicy.Valid(command.Settings)) throw Invalid("notification_settings_invalid");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var row = await db.NotificationPreferences.SingleOrDefaultAsync(x => x.UserId == user, ct); Check(row?.Version ?? 0, command.Version);
        if (row is null) { row = new() { UserId = user, Version = 0 }; db.NotificationPreferences.Add(row); }
        row.Settings = JsonSerializer.Serialize(command.Settings, RevisionWriter.Json); row.Version++;
        // Gönderme saati değişse de SourceAt aynı kalır. Önceden uyarı süresini ikinci kez çıkarma.
        var lead = TimeSpan.FromSeconds(command.Settings.LeadSeconds);
        await db.ReminderWork.Where(x => x.UserId == user && x.State == ReminderState.Pending && x.SourceAt != null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DueAt, x => x.SourceAt!.Value - lead), ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(command.Settings, row.Version);
    }
    public async Task<NotificationPage> ListAsync(Guid user, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var q = db.NotificationIntents.AsNoTracking().Where(x => x.UserId == user && x.State == NotificationIntentState.Ready && x.Kind != "ScheduleStart" && x.Kind != "ScheduleEnd"); var total = await q.CountAsync(ct);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct); var settings = (await PreferencesAsync(user, ct)).Settings;
        return new(rows.Select(x => View(x, settings)).ToArray(), offset, limit, total);
    }
    public async Task<NotificationView> GetAsync(Guid user, Guid id, CancellationToken ct) => View(await Notification(user, id, ct), (await PreferencesAsync(user, ct)).Settings);
    public async Task<NotificationView> SnoozeAsync(Guid user, Guid id, SnoozeNotification command, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct); var row = await Notification(user, id, ct); Check(row.Version, command.Version);
        var settings = (await PreferencesAsync(user, ct)).Settings; var seconds = command.Seconds ?? settings.SnoozeSeconds;
        if (seconds is < 60 or > 86400 || row.State is not (NotificationIntentState.Ready or NotificationIntentState.Pending)) throw Invalid("notification_snooze_invalid");
        row.NotBefore = clock.GetUtcNow().AddSeconds(seconds); row.SnoozeCount++; row.Version++; row.State = NotificationIntentState.Pending; row.ReadAt = null;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(row, settings);
    }
    public async Task<NotificationView> ReadAsync(Guid user, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct); var row = await Notification(user, id, ct); Check(row.Version, version);
        row.ReadAt ??= clock.GetUtcNow(); row.Version++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(row, (await PreferencesAsync(user, ct)).Settings);
    }
    public async Task<ReadAllNotificationsResult> ReadAllAsync(Guid user, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var now = clock.GetUtcNow();
        var count = await db.NotificationIntents.Where(x => x.UserId == user && x.State == NotificationIntentState.Ready && x.ReadAt == null && x.ReadyAt <= now)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, now).SetProperty(x => x.Version, x => x.Version + 1), ct);
        await tx.CommitAsync(ct); return new(count, now);
    }
    private Task<NotificationIntent> Notification(Guid user, Guid id, CancellationToken ct) => FindNotification(user, id, ct);
    private async Task<NotificationIntent> FindNotification(Guid user, Guid id, CancellationToken ct) => await db.NotificationIntents.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct) ?? throw Missing();
    private async Task Lock(Guid user, CancellationToken ct) => _ = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={user} FOR UPDATE").SingleAsync(ct);
    internal static NotificationView View(NotificationIntent n, NotificationSettings s) => new(n.Id, n.Kind, n.SourceId, n.TaskId, n.DailyPlanId, n.RevisionId, n.OccurredAt, n.ReadyAt, n.NotBefore, n.ReadAt, n.State, n.SnoozeCount, s.SoundEnabled, n.Version, n.Title, NotificationSounds.For(s, n.Kind));
    private static void Check(long actual, long expected) { if (actual != expected) throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Kayıt değişmiş; güncel sürümü alın."); }
    private static void Page(int offset, int limit) { if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw Invalid("pagination_invalid"); }
    private static UseCaseException Invalid(string code) => new(ErrorKind.Validation, code, "Bildirim alanlarını kontrol edin.");
    private static UseCaseException Missing() => new(ErrorKind.NotFound, "notification_not_found", "Bildirim kaydı bulunamadı.");
}
