using System.Globalization;
using System.Text;
using Adhd.Application.Notifications;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed partial class NotificationStore
{
    // İmleç sadece listede nerede kaldığımızı söyler. Her sorguyu giriş yapan hesapla süz
    public async Task<NotificationAlertPage> AlertsAsync(Guid user, int limit, string? cursor, CancellationToken ct)
    {
        if (limit is < 1 or > 50) throw Invalid("pagination_invalid");
        var now = clock.GetUtcNow(); var since = now.AddMinutes(-2);
        var after = ReadAlertCursor(cursor, user, since, now);
        var asOf = after?.AsOf ?? now;
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var notificationPreferences = await PreferencesAsync(user, ct); var settings = notificationPreferences.Settings;
        var planning = await preferences.ReadAsync(user, ct);
        if (!settings.Enabled || NotificationPolicy.QuietUntil(settings, planning.Values.TimeZoneId, now).HasValue)
            return new(now, notificationPreferences.Version, [], null);
        var lead = TimeSpan.FromSeconds(settings.LeadSeconds);
        // Önce SQL ile zaman ve durum adaylarının sayfasını al. Kaynak kontrolü bu sayfanın dışına çıkmaz
        var query = db.NotificationIntents.AsNoTracking().Where(n => n.UserId == user && n.State == NotificationIntentState.Ready && n.ReadAt == null)
            .Select(n => new
            {
                Notification = n,
                DueAt = n.SnoozeCount > 0 ? n.NotBefore ?? n.OccurredAt :
                    n.Kind == "ScheduleStart" || n.Kind == "ScheduleEnd" || n.Kind == "TaskDeadline" ? n.OccurredAt - lead : n.NotBefore ?? n.OccurredAt
            }).Where(x => x.DueAt >= since && x.DueAt <= asOf);
        if (after is { } position)
            query = query.Where(x => x.DueAt > position.At || (x.DueAt == position.At && x.Notification.Id.CompareTo(position.Id) > 0));
        var candidates = await query.OrderBy(x => x.DueAt).ThenBy(x => x.Notification.Id).Take(limit + 1).ToArrayAsync(ct);
        var items = new List<NotificationView>();
        foreach (var candidate in candidates.Take(limit))
        {
            var n = candidate.Notification;
            if (NotificationPolicy.Allows(settings, n.Kind) && await NotificationSources.Valid(db, n, now, ct))
                items.Add(View(n, settings) with { SoundEnabled = await NotificationSources.SoundEnabled(db, n, settings, ct) });
        }
        var last = candidates.Take(limit).LastOrDefault();
        var next = candidates.Length > limit && last is not null ? WriteAlertCursor(user, asOf, last.DueAt, last.Notification.Id) : null;
        return new(now, notificationPreferences.Version, items.ToArray(), next);
    }

    private static string WriteAlertCursor(Guid user, DateTimeOffset asOf, DateTimeOffset at, Guid id) =>
        Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user:N}|{asOf.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{at.UtcTicks.ToString(CultureInfo.InvariantCulture)}|{id:N}")).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static (DateTimeOffset AsOf, DateTimeOffset At, Guid Id)? ReadAlertCursor(string? cursor, Guid user, DateTimeOffset since, DateTimeOffset now)
    {
        if (cursor is null) return null;
        try
        {
            if (cursor.Length is < 1 or > 256 || cursor.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not ('-' or '_'))) throw new FormatException();
            var fields = Encoding.UTF8.GetString(PushEndpoints.Decode(cursor)).Split('|');
            if (fields.Length != 4 || !Guid.TryParseExact(fields[0], "N", out var owner) || owner != user ||
                !long.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out var asOfTicks) ||
                !long.TryParse(fields[2], NumberStyles.None, CultureInfo.InvariantCulture, out var ticks) ||
                !Guid.TryParseExact(fields[3], "N", out var id) || id == Guid.Empty) throw new FormatException();
            var asOf = new DateTimeOffset(asOfTicks, TimeSpan.Zero);
            var at = new DateTimeOffset(ticks, TimeSpan.Zero);
            if (asOf < since || asOf > now || at < asOf.AddMinutes(-2) || at > asOf) throw new FormatException();
            return (asOf, at, id);
        }
        catch (Exception e) when (e is FormatException or ArgumentException)
        {
            throw Invalid("notification_alert_cursor_invalid");
        }
    }
}
