using System.Data;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Domain.Planning;
using Adhd.Domain.Preferences;
using Adhd.Domain.Support;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

// Kalan çalışma şu andan sonraki çalışma aralıkları.
// Kalan plan açık saatli blokların kalan
// kısmı ve saatsiz işlerin bilinen kendi
// tahmini. Bölünmüş blok tek öğe sayılır.
public sealed class DayGlanceStore(PlannerDbContext db, IPreferencesStore preferences, IWorkingDayCalendar calendar, TimeProvider clock) : IDayGlanceStore
{
    public async Task<DayGlanceView> ReadAsync(Guid userId, DateOnly date, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct);
        var now = clock.GetUtcNow(); var prefs = (await preferences.ReadAsync(userId, ct)).Values;
        var plan = await db.DailyPlans.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == date, ct);
        var version = await db.PlanningStates.AsNoTracking().Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        return await ReadInSnapshotAsync(userId, date, prefs, plan, version, now, ct);
    }
    internal async Task<DayGlanceView> ReadInSnapshotAsync(Guid userId, DateOnly date, PlanningPreferences prefs,
        DailyPlan? plan, long version, DateTimeOffset now, CancellationToken ct)
    {
        var zone = plan?.TimeZoneId ?? prefs.TimeZoneId;
        var windows = await calendar.UtcIntervalsAsync(userId, prefs, date, ct);
        var working = windows.Sum(w => Remaining(w.StartsAt, w.EndsAt, now));
        var blocks = plan is null ? [] : await db.TaskSchedules.AsNoTracking()
            .Where(x => x.UserId == userId && x.DailyPlanId == plan.Id && x.State == ScheduleState.Planned && x.Kind == ScheduleKind.Work).ToArrayAsync(ct);
        var items = await (from item in db.DayItems.AsNoTracking()
                           join task in db.Tasks.AsNoTracking() on new { item.UserId, Id = item.TaskId } equals new { task.UserId, task.Id }
                           where item.UserId == userId && item.LocalDate == date && item.State == DayItemState.Planned && task.DeletedAt == null && task.ArchivedAt == null
                           select new { item.CompletedAt, item.StartsAt, item.EndsAt, task.Id, task.DirectEstimatedSeconds }).ToArrayAsync(ct);
        decimal planned = 0; var unknown = 0; var completed = 0; var open = 0; var unbounded = 0;
        foreach (var group in blocks.GroupBy(x => x.SplitGroupId ?? x.Id))
        {
            if (group.Any(x => x.CompletedAt is null)) { open++; planned += group.Where(x => x.CompletedAt is null).Sum(x => Remaining(x.StartsAt, x.EndsAt, now)); }
            else completed++;
        }
        foreach (var item in items)
        {
            if (item.CompletedAt is not null) { completed++; continue; }
            open++;
            if(item.StartsAt is {} start) {
                if(item.EndsAt is {} end) planned += Remaining(start,end,now); else unbounded++;
            } else if (item.DirectEstimatedSeconds is { } seconds) planned += seconds; else unknown++;
        }
        var dayStart = PlanTime.DayStart(date, zone); var dayEnd = PlanTime.DayStart(date.AddDays(1), zone); var cutoff = now < dayEnd ? now : dayEnd;
        var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && !x.IsVoided && x.StartedAt < cutoff && (x.EndedAt == null || x.EndedAt > dayStart))
            .Select(x => new { x.StartedAt, x.EndedAt }).ToArrayAsync(ct);
        var actual = segments.Sum(x => Remaining(x.StartedAt < dayStart ? dayStart : x.StartedAt, x.EndedAt is { } end && end < cutoff ? end : cutoff, DateTimeOffset.MinValue));
        var taskIds = blocks.Where(x => x.CompletedAt is null && x.TaskId.HasValue).Select(x => x.TaskId!.Value)
            .Concat(items.Where(x => x.CompletedAt is null).Select(x => x.Id)).Distinct().ToArray();
        var energy = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && taskIds.Contains(x.Id)).Select(x => new { x.Id, x.EnergyDemand, x.Priority }).ToDictionaryAsync(x => x.Id, ct);
        var steps = (await db.Notes.AsNoTracking().Where(x => x.UserId == userId && x.Kind == NoteKind.NextStep && x.DeletedAt == null && x.TaskId != null && taskIds.Contains(x.TaskId.Value))
                .Select(x => new { TaskId = x.TaskId!.Value, x.Id, x.Text, x.CreatedAt }).ToArrayAsync(ct))
            .GroupBy(x => x.TaskId).ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).First());
        var hints = taskIds.Order().Select(id => new DayGlanceHint(id, energy.GetValueOrDefault(id)?.EnergyDemand, steps.TryGetValue(id, out var s) ? new DayGlanceNextStep(s.Id, s.Text) : null, energy.GetValueOrDefault(id)?.Priority)).ToArray();
        return new(date, working, planned, unknown, completed, open, actual, planned > working, hints, version, now, unbounded);
    }

    private static decimal Remaining(DateTimeOffset start, DateTimeOffset end, DateTimeOffset now)
    {
        var from = start > now ? start : now;
        return end > from ? (end - from).Ticks / (decimal)TimeSpan.TicksPerSecond : 0;
    }
}

