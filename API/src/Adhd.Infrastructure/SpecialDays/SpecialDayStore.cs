using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.SpecialDays;
using Adhd.Domain.Jobs;
using Adhd.Domain.Preferences;
using Adhd.Domain.SpecialDays;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.SpecialDays;

// Özel gün yazıları hesap kilitli. Oluşturma anahtarlı, güncelleme/silme sürümlü ve 409 korumalı. Hatırlatma yerel 09:00 niyetidir. Değişiklik veya silme eskisini geçersiz yapıp yenisini hazırlar.
public sealed class SpecialDayStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : ISpecialDayStore, IWorkingDayCalendar
{
    public const string NotificationKind = "SpecialDay";
    // Hatırlatmalar bu kadar ileri hazırlanır. Günlük iş pencereyi dolu tutar.
    public static readonly TimeSpan ReminderHorizon = TimeSpan.FromDays(400);

    public async Task<SpecialDayPage> ListAsync(Guid userId, int offset, int limit, CancellationToken ct)
    {
        var today = await Today(userId, ct);
        var rows = await db.SpecialDays.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null).ToArrayAsync(ct);
        // Yaklaşanları önce göster. Geçmişte kalmış tek seferlik günler en sona
        var ordered = rows.Select(x => (Row: x, Next: Next(x, today))).OrderBy(x => x.Next is null).ThenBy(x => x.Next).ThenBy(x => x.Row.Title, StringComparer.CurrentCulture).ThenBy(x => x.Row.Id).ToArray();
        return new(ordered.Skip(offset).Take(limit).Select(x => View(x.Row, x.Next)).ToArray(), offset, limit, rows.Length);
    }

    public async Task<SpecialDayView> CreateAsync(Guid userId, SpecialDayCommand command, string key, CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command, RevisionWriter.Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "special-day-create" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw new UseCaseException(ErrorKind.Conflict, "idempotency_conflict", "Anahtar başka bir komutta kullanılmış.");
            return JsonSerializer.Deserialize<SpecialDayView>(previous.Response, RevisionWriter.Json)!;
        }
        var now = clock.GetUtcNow();
        var row = new SpecialDay { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now };
        Apply(row, command); db.SpecialDays.Add(row);
        await Prepare(userId, row, now, ct);
        var view = View(row, Next(row, await Today(userId, ct)));
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "special-day-create", Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(view, RevisionWriter.Json), CreatedAt = now });
        state.SpecialDaysVersion++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return view;
    }

    public async Task<SpecialDayView> UpdateAsync(Guid userId, Guid id, long version, SpecialDayCommand command, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var row = await Find(userId, id, version, ct);
        if (row.DeletedAt is not null) throw Conflict("special_day_deleted", "Bu özel gün silinmiş.");
        var now = clock.GetUtcNow(); Apply(row, command); row.Version++; row.UpdatedAt = now;
        await Obsolete(userId, row.Id, ct); await Prepare(userId, row, now, ct);
        state.SpecialDaysVersion++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return View(row, Next(row, await Today(userId, ct)));
    }

    public async Task<SpecialDayView> DeleteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var row = await Find(userId, id, version, ct);
        if (restore != (row.DeletedAt is not null)) throw Conflict(restore ? "special_day_not_deleted" : "special_day_deleted", restore ? "Bu özel gün silinmemiş." : "Bu özel gün zaten silinmiş.");
        var now = clock.GetUtcNow(); row.DeletedAt = restore ? null : now; row.Version++; row.UpdatedAt = now;
        await Obsolete(userId, row.Id, ct);
        if (restore) await Prepare(userId, row, now, ct);
        state.SpecialDaysVersion++; await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return View(row, restore ? Next(row, await Today(userId, ct)) : null);
    }

    public async Task<SpecialDayOccurrencePage> OccurrencesAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var state = await db.PlanningStates.AsNoTracking().SingleAsync(x => x.UserId == userId, ct);
        var rows = await db.SpecialDays.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null).ToArrayAsync(ct);
        var items = rows.SelectMany(r => SpecialDayRules.Occurrences(r, from, to).Select(date => new SpecialDayOccurrence(r.Id, date, r.Title, r.Kind, r.NonWorking, r.Version)))
            .OrderBy(x => x.Date).ThenBy(x => x.Kind).ThenBy(x => x.Title, StringComparer.CurrentCulture).ThenBy(x => x.SpecialDayId).ToArray();
        return new(from, to, items, new(new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), clock.GetUtcNow()));
    }

    // Çalışma dışı özel gün uygulanmış çalışma aralıkları. Ayardaki açık tarih istisnası öncelikli.
    public async Task<UtcWindow[]> UtcIntervalsAsync(Guid userId, PlanningPreferences p, DateOnly date, CancellationToken ct)
    {
        if (p.Exceptions.Any(x => x.Date == date)) return WorkingCalendar.UtcIntervals(p, date);
        return (await NonWorkingDatesAsync(userId, date, date, ct)).Contains(date) ? [] : WorkingCalendar.UtcIntervals(p, date);
    }

    public Task<HashSet<DateOnly>> NonWorkingDatesAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct) => NonWorkingDatesAsync(db, userId, from, to, ct);

    public static async Task<HashSet<DateOnly>> NonWorkingDatesAsync(PlannerDbContext db, Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var rows = await db.SpecialDays.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && x.NonWorking).ToArrayAsync(ct);
        return rows.SelectMany(r => SpecialDayRules.Occurrences(r, from, to)).ToHashSet();
    }
    public static async Task<bool> IsNonWorkingAsync(PlannerDbContext db, Guid userId, DateOnly date, CancellationToken ct) =>
        (await NonWorkingDatesAsync(db, userId, date, date, ct)).Contains(date);

    // Ufuk içindeki eksik hatırlatma niyetini ekler. Kaynak anahtarı tekrarı önler.
    public async Task<int> Prepare(Guid userId, SpecialDay row, DateTimeOffset now, CancellationToken ct)
    {
        if (row.Reminder == SpecialDayReminder.None || row.DeletedAt is not null) return 0;
        var zone = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId;
        var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, TimeZoneInfo.FindSystemTimeZoneById(zone)).DateTime);
        var added = 0;
        foreach (var date in SpecialDayRules.Occurrences(row, localToday, localToday.AddDays((int)ReminderHorizon.TotalDays + 7)))
        {
            var at = SpecialDayRules.ReminderInstant(date, row.Reminder, zone);
            if (at <= now || at > now + ReminderHorizon) continue;
            var key = $"special-day:{row.Id}:v{row.Version}:{date:yyyy-MM-dd}";
            if (db.NotificationIntents.Local.Any(x => x.UserId == userId && x.SourceKey == key) || await db.NotificationIntents.AnyAsync(x => x.UserId == userId && x.SourceKey == key, ct)) continue;
            db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = userId, Kind = NotificationKind, SourceKey = key, SourceId = row.Id, SourceVersion = row.Version, OccurredAt = at, CreatedAt = now, NotBefore = at });
            added++;
        }
        return added;
    }

    private Task<int> Obsolete(Guid userId, Guid id, CancellationToken ct) => db.NotificationIntents
        .Where(x => x.UserId == userId && x.Kind == NotificationKind && x.SourceId == id && x.State == NotificationIntentState.Pending)
        .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, NotificationIntentState.Obsolete).SetProperty(x => x.Version, x => x.Version + 1), ct);

    private static void Apply(SpecialDay row, SpecialDayCommand c)
    {
        row.Title = c.Title; row.Kind = c.Kind; row.Month = c.Month; row.Day = c.Day; row.Year = c.Year; row.Recurrence = c.Recurrence;
        row.NonWorking = c.NonWorking; row.Reminder = c.Reminder;
    }
    private async Task<SpecialDay> Find(Guid userId, Guid id, long version, CancellationToken ct)
    {
        var row = await db.SpecialDays.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "special_day_not_found", "Özel gün bulunamadı.");
        if (row.Version != version) throw Conflict("version_conflict", "Özel gün değişmiş; güncel kaydı alın.");
        return row;
    }
    private async Task<DateOnly> Today(Guid userId, CancellationToken ct)
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById((await preferences.ReadAsync(userId, ct)).Values.TimeZoneId);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(clock.GetUtcNow(), zone).DateTime);
    }
    private static DateOnly? Next(SpecialDay d, DateOnly today) => SpecialDayRules.Occurrences(d, today, today.AddYears(1)).Cast<DateOnly?>().FirstOrDefault();
    private Task<Adhd.Domain.Users.UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    internal static SpecialDayView View(SpecialDay r, DateOnly? next) => new(r.Id, r.Title, r.Kind, r.Month, r.Day, r.Year, r.Recurrence, r.NonWorking, r.Reminder, next, r.Version, r.CreatedAt, r.UpdatedAt, r.DeletedAt);
}
