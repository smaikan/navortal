using System.Text.Json;
using Adhd.Domain.Preferences;
using Adhd.Domain.Support;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Tasks;

/// <summary>Tarih aralığının bitişine bağlı hatırlatmalar ve alt görev aralık kalıtımı. Eski "son tarih" alanı hatırlatma üretmez.</summary>
internal static class TaskRangeReminders
{
    internal static async Task<TimeZoneInfo> Zone(PlannerDbContext db, Guid userId, CancellationToken ct)
    {
        var payload = await db.Preferences.AsNoTracking().Where(x => x.UserId == userId).Select(x => x.Payload).SingleOrDefaultAsync(ct);
        var id = payload is null ? new PlanningPreferences().TimeZoneId : JsonSerializer.Deserialize<PlanningPreferences>(payload)?.TimeZoneId ?? new PlanningPreferences().TimeZoneId;
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); } catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException) { return TimeZoneInfo.Utc; }
    }
    /// <summary>Bir hatırlatma: olay anı hep bitiş günü 09:00, bildirim anı bitişten bir gün önce 18:00 veya bitiş günü 09:00.</summary>
    internal readonly record struct Slot(DateTimeOffset Occurs, DateTimeOffset Due);
    internal static IReadOnlyList<Slot> Slots(PlannedRange range, TimeZoneInfo zone)
    {
        var at = PlannedRanges.EndReminders(range, zone);
        return at.Select(x => new Slot(at[^1], x)).ToArray();
    }
    /// <summary>Açık görevin güncel hatırlatmaları. Aralık yoksa üst görevden kalıtılır.</summary>
    internal static async Task<IReadOnlyList<Slot>> Instants(PlannerDbContext db, Guid userId, Guid taskId, CancellationToken ct)
    {
        var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var task = tasks.SingleOrDefault(x => x.Id == taskId);
        if (task is null || !SupportRules.Open(task) || PlannedRanges.OwnOrInherited(tasks)[taskId] is not { } range) return [];
        return Slots(range, await Zone(db, userId, ct));
    }
    /// <summary>Kendi aralığı olmayıp üst görevinden kalıtılan aralığı [from, to] gününe değen görevler.</summary>
    internal static async Task<HashSet<Guid>> InheritedOverlapping(PlannerDbContext db, Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.ArchivedAt == null).ToArrayAsync(ct);
        var own = tasks.Where(x => x.PlannedFrom is not null).Select(x => x.Id).ToHashSet();
        return PlannedRanges.OwnOrInherited(tasks).Where(x => !own.Contains(x.Key) && x.Value is { } r && r.From <= to && r.To >= from).Select(x => x.Key).ToHashSet();
    }
}
