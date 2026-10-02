using System.Data;
using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Domain.Analytics;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Analytics;

internal sealed class AnalyticsSegment
{
    public Guid Id { get; set; } public Guid SessionId { get; set; } public Guid? TaskId { get; set; } public Guid? ScheduleId { get; set; }
    public DateTimeOffset StartsAt { get; set; } public DateTimeOffset? EndsAt { get; set; } public string Zone { get; set; } = "";
}
public sealed partial class PlanAnalyticsStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : IPlanAnalyticsStore
{
    private const int MaxRows = 50000;
    private sealed record ReferenceBlock(DateOnly Date, string Zone, ScheduleView Block);
    private sealed record Piece(DateOnly Date, Guid? TaskId, decimal Seconds);
    private sealed record DeferEvent(DateOnly? Date, string? Reason);
    private sealed record LifetimeData(ILookup<Guid?, AnalyticsSegment> ByTask, ILookup<Guid?, AnalyticsSegment> BySchedule);
    public async Task<PlanAnalyticsView> ReadAsync(Guid userId, PlanAnalyticsQuery q, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow(); var pref = await preferences.ReadAsync(userId, ct);
        var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var plans = await db.DailyPlans.AsNoTracking().Where(x => x.UserId == userId && x.LocalDate >= q.FromDate && x.LocalDate <= q.ToDate).ToArrayAsync(ct);
        var revisionIds = plans.SelectMany(x => new[] { x.BaselineRevisionId, x.CurrentRevisionId }).Where(x => x.HasValue).Select(x => x!.Value).Distinct().ToArray();
        var items = await db.PlanRevisionItems.AsNoTracking().Where(x => x.UserId == userId && revisionIds.Contains(x.RevisionId)).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(items.Length);
        var snapshots = items.ToLookup(x => x.RevisionId, x => JsonSerializer.Deserialize<ScheduleView>(x.Snapshot, RevisionWriter.Json)!);
        ReferenceBlock[] Reference(bool baseline) => plans.SelectMany(p => (baseline ? p.BaselineRevisionId : p.CurrentRevisionId) is { } id ? snapshots[id].Where(x => x.Kind == ScheduleKind.Work && x.State == ScheduleState.Planned).Select(b => new ReferenceBlock(p.LocalDate, p.TimeZoneId, b)) : []).ToArray();
        var initial = Reference(true); var current = Reference(false); var all = initial.Concat(current).ToArray();
        var periodRows = await PeriodSegments(userId, q.FromDate, q.ToDate, now, ct); var pieces = new List<Piece>();
        foreach (var row in periodRows) foreach (var part in AnalyticsTime.Slice(row.StartsAt, row.EndsAt ?? now, row.Zone, q.FromDate, q.ToDate)) pieces.Add(new(part.Date, row.TaskId, part.Seconds));
        var taskIds = all.Where(x => x.Block.TaskId.HasValue).Select(x => x.Block.TaskId!.Value).Distinct().ToArray();
        var lifetimeRows = await LifetimeSegments(userId, taskIds, now, ct); var lifetime = new LifetimeData(lifetimeRows.ToLookup(x => x.TaskId), lifetimeRows.ToLookup(x => x.ScheduleId));
        var keys = all.Where(x => x.Block.TaskId.HasValue).Select(x => new HistoryKey(x.Block.TaskId!.Value, x.Date, x.Zone))
            .Concat(all.Where(x => x.Block.TaskId.HasValue).Select(x => new HistoryKey(x.Block.TaskId!.Value, q.ToDate, x.Zone))).ToArray();
        var history = await AnalyticsHistory.Read(db, userId, keys, now, ct);
        var planIds = plans.Select(x => x.Id).ToArray(); var revisions = await db.PlanRevisions.AsNoTracking().Where(x => x.UserId == userId && planIds.Contains(x.DailyPlanId) && x.CreatedAt <= now).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(revisions.Length);
        var defers = await Defers(userId, q.FromDate, q.ToDate, now, ct); var actual = pieces.ToArray();
        var days = new List<PlanAnalyticsDay>();
        for (var date = q.FromDate; date <= q.ToDate; date = date.AddDays(1))
        {
            var p = plans.SingleOrDefault(x => x.LocalDate == date); var a = actual.Where(x => x.Date == date).ToArray(); var r = revisions.Where(x => x.DailyPlanId == p?.Id).ToArray(); var d = defers.Where(x => x.Date == date).ToArray();
            days.Add(new(date, p?.TimeZoneId ?? pref.Values.TimeZoneId, p?.Id, p?.BaselineRevisionId, p?.CurrentRevisionId, a.Sum(x => x.Seconds),
                Metrics(initial.Where(x => x.Date == date).ToArray(), a, lifetime, history, date, now, q.StartToleranceSeconds), Metrics(current.Where(x => x.Date == date).ToArray(), a, lifetime, history, date, now, q.StartToleranceSeconds),
                r.Length, r.GroupBy(x => (x.Trigger, x.Reason)).Select(g => new RevisionReasonCount(g.Key.Trigger, g.Key.Reason, g.Count())).OrderBy(x => x.Trigger, StringComparer.Ordinal).ThenBy(x => x.Reason, StringComparer.Ordinal).ToArray(),
                d.Length, d.GroupBy(x => x.Reason).Select(g => new DeferReasonCount(g.Key, g.Key is not null, g.Count())).OrderBy(x => x.Reason, StringComparer.Ordinal).ToArray()));
        }
        return new(q.FromDate, q.ToDate, now, version, "SourceSessionZone", q.StartToleranceSeconds, actual.Sum(x => x.Seconds),
            Metrics(initial, actual, lifetime, history, q.ToDate, now, q.StartToleranceSeconds), Metrics(current, actual, lifetime, history, q.ToDate, now, q.StartToleranceSeconds), revisions.Length, defers.Count(x => x.Date.HasValue), defers.Count(x => !x.Date.HasValue), days.ToArray());
    }
    private static PlanMetrics Metrics(ReferenceBlock[] blocks, Piece[] actual, LifetimeData lifetime, Dictionary<HistoryKey, Adhd.Application.Tasks.TaskView?> history, DateOnly endDate, DateTimeOffset now, int tolerance)
    {
        var components = blocks.Where(x => x.Block.TaskId.HasValue && x.Block.TaskSnapshot?.HasDirectWork == true).GroupBy(x => x.Block.TaskId!.Value).ToArray();
        var completed = 0; var unknownCompletion = 0; var unknownEstimate = 0; var conflicts = 0; var missingActual = 0; decimal known = 0, completedKnown = 0; var errors = new List<decimal>();
        foreach (var group in components)
        {
            var reference = group.OrderBy(x => x.Date).ThenBy(x => x.Block.StartsAt).ThenBy(x => x.Block.Id).First(); var estimate = reference.Block.TaskSnapshot!.DirectEstimatedSeconds;
            var state = history.GetValueOrDefault(new(group.Key, endDate, reference.Zone)); var knownState = state?.HasDirectWork == true; var done = knownState && state!.DirectWorkCompleted && state.State is not (TaskState.Canceled or TaskState.Skipped or TaskState.Deferred);
            if (!knownState) unknownCompletion++; if (done) completed++;
            if (estimate.HasValue) { known += estimate.Value; if (done) completedKnown += estimate.Value; } else unknownEstimate++;
            if (group.Select(x => x.Block.TaskSnapshot!.DirectEstimatedSeconds).Distinct().Count() > 1) conflicts++;
            if (done && estimate.HasValue)
            {
                var cutoff = Cutoff(endDate, reference.Zone, now); var seconds = Actual(lifetime.ByTask[group.Key], cutoff); if (seconds > 0) errors.Add(seconds - estimate.Value); else missingActual++;
            }
        }
        decimal quota = 0, fulfilled = 0;
        var actualByTaskDay = actual.GroupBy(x => (x.Date, x.TaskId)).ToDictionary(g => g.Key, g => g.Sum(x => x.Seconds));
        foreach (var g in blocks.Where(x => x.Block.TaskId.HasValue && x.Block.TaskSnapshot?.HasDirectWork == true).GroupBy(x => (x.Date, x.Block.TaskId)))
        {
            var amount = PlanMetricMath.UnionSeconds(g.Select(x => (x.Block.StartsAt, x.Block.EndsAt))); quota += amount; fulfilled += Math.Min(amount, actualByTaskDay.GetValueOrDefault(g.Key));
        }
        var plannedIds = blocks.Select(x => x.Block.TaskId).Where(x => x.HasValue).ToHashSet(); var raw = blocks.Sum(x => (x.Block.EndsAt - x.Block.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond);
        var union = blocks.GroupBy(x => x.Date).Sum(g => PlanMetricMath.UnionSeconds(g.Select(x => (x.Block.StartsAt, x.Block.EndsAt))));
        DelayMetrics Delays(bool fixedBlocks)
        {
            var values = new List<decimal>();
            foreach (var b in blocks.Where(x => x.Block.IsFixed == fixedBlocks))
            {
                var cutoff = Cutoff(endDate, b.Zone, now); var starts = lifetime.BySchedule[b.Block.Id].Where(x => x.StartsAt < cutoff && (x.EndsAt ?? cutoff) > x.StartsAt).Select(x => x.StartsAt).ToArray();
                if (starts.Length != 0) values.Add((starts.Min() - b.Block.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond);
            }
            var late = values.Where(x => x > tolerance).ToArray(); var early = values.Count(x => x < -tolerance);
            return new(values.Count, late.Length, early, values.Count - late.Length - early, values.Count == 0 ? null : values.Average(), values.Count == 0 ? null : late.Length == 0 ? 0 : late.Average());
        }
        var missingSnapshots = blocks.Count(x => x.Block.TaskSnapshot is null);
        return new(raw, Math.Max(0, raw - union), components.Length, completed, unknownCompletion, unknownCompletion == 0 && missingSnapshots == 0 ? PlanMetricMath.Ratio(completed, components.Length) : null,
            known, completedKnown, unknownEstimate, PlanMetricMath.Ratio(components.Length - unknownEstimate, components.Length),
            unknownCompletion == 0 && missingSnapshots == 0 ? PlanMetricMath.Ratio(completedKnown, known) : null, conflicts, missingSnapshots, quota, fulfilled, PlanMetricMath.Ratio(fulfilled, quota), actual.Where(x => !plannedIds.Contains(x.TaskId)).Sum(x => x.Seconds),
            new(errors.Count, missingActual, errors.Count == 0 ? null : errors.Average(), errors.Count == 0 ? null : errors.Select(Math.Abs).Average()), Delays(true), Delays(false));
    }
    private async Task<AnalyticsSegment[]> PeriodSegments(Guid user, DateOnly from, DateOnly to, DateTimeOffset now, CancellationToken ct)
    {
        var lower = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var upper = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var rows = await Segments(user).Where(x => x.StartsAt < upper && (x.EndsAt ?? now) > lower).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); return Checked(rows, now);
    }
    private async Task<AnalyticsSegment[]> LifetimeSegments(Guid user, Guid[] tasks, DateTimeOffset now, CancellationToken ct)
    {
        if (tasks.Length == 0) return []; var rows = await Segments(user).Where(x => x.TaskId.HasValue && tasks.Contains(x.TaskId.Value) && x.StartsAt <= now).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); return Checked(rows, now);
    }
    private IQueryable<AnalyticsSegment> Segments(Guid user) => from s in db.WorkSegments.AsNoTracking() join w in db.WorkSessions.AsNoTracking() on new { s.UserId, Id = s.SessionId } equals new { w.UserId, w.Id }
        where s.UserId == user && !s.IsVoided select new AnalyticsSegment { Id = s.Id, SessionId = w.Id, TaskId = w.TaskId, ScheduleId = w.StartedScheduleId, StartsAt = s.StartedAt, EndsAt = s.EndedAt, Zone = w.TimeZoneId };
    private static AnalyticsSegment[] Checked(AnalyticsSegment[] rows, DateTimeOffset now)
    {
        Bound(rows.Length); if (rows.Any(x => x.StartsAt > now || x.EndsAt > now || x.EndsAt < x.StartsAt)) throw new UseCaseException(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanı çalışma kaydından geride."); return rows;
    }
    private static decimal Actual(IEnumerable<AnalyticsSegment> rows, DateTimeOffset cutoff) => rows.Sum(x => { var end = (x.EndsAt ?? cutoff) < cutoff ? x.EndsAt!.Value : cutoff; return end > x.StartsAt ? (end - x.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond : 0; });
    private static DateTimeOffset Cutoff(DateOnly date, string zone, DateTimeOffset now) { var end = PlanTime.DayStart(date.AddDays(1), zone); return end < now ? end : now; }
    private static void Bound(int count) { if (count > MaxRows) throw new UseCaseException(ErrorKind.Conflict, "analytics_range_too_dense", "Bu rapor çok yoğun; daha küçük tarih aralığı seçin."); }
    private async Task<DeferEvent[]> Defers(Guid user, DateOnly from, DateOnly to, DateTimeOffset now, CancellationToken ct)
    {
        var lower = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var upper = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var events = await db.TaskEvents.AsNoTracking().Where(x => x.UserId == user && x.EffectiveAt >= lower && x.EffectiveAt < upper && x.EffectiveAt <= now && x.Type == "StateChanged").OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(events.Length);
        return events.Where(x => AnalyticsHistory.After(x.Payload)?.State == TaskState.Deferred && AnalyticsHistory.Before(x.Payload)?.State != TaskState.Deferred)
            .Select(x => new DeferEvent(x.TimeZoneId is null ? null : PlanTime.Date(x.EffectiveAt, x.TimeZoneId), AnalyticsHistory.Reason(x.Payload))).Where(x => x.Date is null || x.Date >= from && x.Date <= to).ToArray();
    }
}
