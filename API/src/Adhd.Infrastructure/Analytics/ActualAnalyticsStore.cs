using System.Data;
using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Work;
using Adhd.Domain.Analytics;
using Adhd.Domain.Focus;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Focus;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Analytics;

public sealed class ActualAnalyticsStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : IActualAnalyticsStore
{
    private const int MaxRows = 50000;
    private sealed record WorkPiece(Guid SessionId, Guid SegmentId, DateOnly Date, string Zone, decimal Seconds, bool Manual, Guid? TaskId, TaskAtStart? Snapshot);
    private sealed record FocusPiece(Guid FocusId, DateOnly Date, string Zone, decimal Active, decimal Overtime);
    private sealed record FocusMarker(Guid FocusId, DateOnly Date, string Zone, string Kind);
    private sealed record Dataset(DateTimeOffset Now, long Version, int WeekStartsOn, WorkPiece[] Work, FocusPiece[] Focus, FocusMarker[] Markers);
    public async Task<ActualAnalyticsView> ReadAsync(Guid userId, ActualAnalyticsQuery query, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var data = await Load(userId, query, true, ct);
        var groups = Enumerable.Range(0, query.ToDate.DayNumber - query.FromDate.DayNumber + 1).Select(i => query.FromDate.AddDays(i)).GroupBy(d => AnalyticsTime.BucketStart(d, query.Bucket, data.WeekStartsOn));
        var buckets = groups.Select(g =>
        {
            var from = g.Min(); var to = g.Max(); var work = data.Work.Where(x => x.Date >= from && x.Date <= to).ToArray(); var focus = data.Focus.Where(x => x.Date >= from && x.Date <= to).ToArray(); var markers = data.Markers.Where(x => x.Date >= from && x.Date <= to).ToArray();
            return new ActualBucketView(g.Key, from, to, Zones(work, focus, markers), Metrics(work, focus, markers));
        }).ToArray();
        return new(query.FromDate, query.ToDate, query.Bucket, data.WeekStartsOn, "SourceSessionZone", data.Now, data.Version, Zones(data.Work, data.Focus, data.Markers), Metrics(data.Work, data.Focus, data.Markers), buckets);
    }
    public async Task<ActualBreakdownPage> BreakdownAsync(Guid userId, ActualAnalyticsQuery query, AnalyticsDimension dimension, int offset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var data = await Load(userId, query, false, ct);
        var grouped = data.Work.GroupBy(x => Key(x, dimension)).Select(g => new ActualBreakdownItem(g.Key.Id, g.Key.Label, g.Key.Available, g.Sum(x => x.Seconds), g.Select(x => x.SessionId).Distinct().Count()))
            .OrderByDescending(x => x.WorkSeconds).ThenBy(x => x.Id).ThenBy(x => x.Label, StringComparer.Ordinal).ToArray();
        return new(query.FromDate, query.ToDate, dimension, "SourceSessionZone", data.Now, data.Work.Sum(x => x.Seconds), grouped.Skip(offset).Take(limit).ToArray(), offset, limit, grouped.Length);
    }
    private async Task<Dataset> Load(Guid userId, ActualAnalyticsQuery q, bool includeFocus, CancellationToken ct)
    {
        var now = clock.GetUtcNow(); var p = await preferences.ReadAsync(userId, ct); var version = await db.PlanningStates.Where(x => x.UserId == userId).Select(x => x.PlanningVersion).SingleAsync(ct);
        var outerStart = new DateTimeOffset(q.FromDate.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var outerEnd = new DateTimeOffset(q.ToDate.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var rows = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && !x.IsVoided && x.StartedAt < outerEnd && (x.EndedAt ?? now) > outerStart).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(rows.Length);
        var focuses = includeFocus ? await db.FocusSessions.AsNoTracking().Where(x => x.UserId == userId && x.StartedAt < outerEnd && (x.EndedAt ?? now) >= outerStart).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct) : []; Bound(focuses.Length);
        var ids = rows.Select(x => x.SessionId).Concat(focuses.Select(x => x.WorkSessionId)).Distinct().ToArray();
        var sessions = await db.WorkSessions.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var work = new List<WorkPiece>(); var focusPieces = new List<FocusPiece>(); var markers = new List<FocusMarker>();
        foreach (var group in rows.GroupBy(x => x.SessionId))
        {
            var session = sessions[group.Key]; var snapshot = ReadSnapshot(session.TaskSnapshot);
            foreach (var segment in group)
            {
                if (segment.StartedAt > now || segment.EndedAt > now || segment.EndedAt < segment.StartedAt) throw ClockConflict();
                foreach (var slice in Slice(segment.StartedAt, segment.EndedAt ?? now, session.TimeZoneId, q)) work.Add(new(session.Id, segment.Id, slice.Date, session.TimeZoneId, slice.Seconds, session.Source == WorkSource.Manual, session.TaskId, snapshot));
            }
        }
        if (focuses.Length != 0)
        {
            var focusIds = focuses.Select(x => x.WorkSessionId).Distinct().ToArray();
            // Rapor öncesi eşiğe ulaşıldı mı diye eski çalışmaya bak. Bu süreyi rapora ekleme.
            var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && focusIds.Contains(x.SessionId) && !x.IsVoided && x.StartedAt < outerEnd).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(segments.Length); var bySession = segments.ToLookup(x => x.SessionId);
            foreach (var focus in focuses)
            {
                var session = sessions[focus.WorkSessionId]; var zone = session.TimeZoneId; var reportEnd = PlanTime.DayStart(q.ToDate.AddDays(1), zone); var cutoff = now < reportEnd ? now : reportEnd;
                var end = focus.WorkEndedAt is { } ended && ended < cutoff ? ended : cutoff; var intervals = bySession[session.Id].ToArray();
                if (intervals.Any(x => x.StartedAt > now || x.EndedAt > now || x.EndedAt < x.StartedAt)) throw ClockConflict();
                var target = AnalyticsTime.FocusThreshold(intervals, focus.StartedAt, end, FocusLifecycle.Settings(focus).WorkSeconds);
                var active = new Dictionary<DateOnly, decimal>(); var overtime = new Dictionary<DateOnly, decimal>();
                foreach (var segment in intervals)
                {
                    var a = segment.StartedAt > focus.StartedAt ? segment.StartedAt : focus.StartedAt; var b = (segment.EndedAt ?? end) < end ? segment.EndedAt!.Value : end;
                    if (b > a) foreach (var part in Slice(a, b, zone, q)) active[part.Date] = active.GetValueOrDefault(part.Date) + part.Seconds;
                }
                foreach (var (a, b) in target.Overtime) foreach (var part in Slice(a, b, zone, q)) overtime[part.Date] = overtime.GetValueOrDefault(part.Date) + part.Seconds;
                foreach (var (date, seconds) in active) focusPieces.Add(new(focus.Id, date, zone, seconds, overtime.GetValueOrDefault(date)));
                void Mark(DateTimeOffset? instant, string kind)
                {
                    if (!instant.HasValue || instant > now) return; var date = PlanTime.Date(instant.Value, zone); if (date >= q.FromDate && date <= q.ToDate) markers.Add(new(focus.Id, date, zone, kind));
                }
                Mark(focus.StartedAt, "Started"); if (focus.State == FocusState.Finished) Mark(focus.EndedAt, "Finished"); Mark(target.TargetAt, "EffectiveTarget"); Mark(focus.TargetReachedAt, "RecordedTarget");
            }
        }
        return new(now, version, p.Values.WeekStartsOn, work.ToArray(), focusPieces.ToArray(), markers.ToArray());
    }
    private static ActualMetrics Metrics(WorkPiece[] work, FocusPiece[] focus, FocusMarker[] markers)
    {
        var cycles = focus.Select(x => x.FocusId).Distinct().Count(); var active = focus.Sum(x => x.Active);
        int Count(string kind) => markers.Where(x => x.Kind == kind).Select(x => x.FocusId).Distinct().Count();
        return new(work.Sum(x => x.Seconds), work.Where(x => x.TaskId.HasValue).Sum(x => x.Seconds), work.Where(x => !x.TaskId.HasValue).Sum(x => x.Seconds), work.Where(x => x.Manual).Sum(x => x.Seconds),
            work.Select(x => x.SessionId).Distinct().Count(), work.Select(x => x.SegmentId).Distinct().Count(), work.Where(x => x.TaskId.HasValue && x.Snapshot is null).Sum(x => x.Seconds),
            new(active, focus.Sum(x => x.Overtime), cycles, Count("Started"), Count("Finished"), Count("EffectiveTarget"), Count("RecordedTarget"), cycles == 0 ? null : active / cycles));
    }
    private static (Guid? Id, string Label, bool Available) Key(WorkPiece p, AnalyticsDimension dimension)
    {
        if (p.TaskId is null) return (null, "Bağımsız odak", true);
        if (p.Snapshot is null) return (dimension == AnalyticsDimension.Task ? p.TaskId : null, "Geçmiş bağlam bilinmiyor", false);
        if (dimension == AnalyticsDimension.Task) return (p.TaskId, p.Snapshot.Title, true);
        var item = dimension == AnalyticsDimension.Project ? p.Snapshot.Project : p.Snapshot.Category;
        return (item?.Id, item?.Name ?? "Sınıflandırılmamış", true);
    }
    private static string[] Zones(WorkPiece[] w, FocusPiece[] f, FocusMarker[] m) => w.Select(x => x.Zone).Concat(f.Select(x => x.Zone)).Concat(m.Select(x => x.Zone)).Distinct().Order(StringComparer.Ordinal).ToArray();
    private static ActiveSlice[] Slice(DateTimeOffset a, DateTimeOffset b, string zone, ActualAnalyticsQuery q)
    {
        try { return AnalyticsTime.Slice(a, b, zone, q.FromDate, q.ToDate); }
        catch (TimeZoneNotFoundException) { throw new UseCaseException(ErrorKind.Conflict, "historical_zone_unavailable", "Tarihsel saat dilimi bulunamadı."); }
    }
    private static TaskAtStart? ReadSnapshot(string? json) => json is null ? null : JsonSerializer.Deserialize<TaskAtStart>(json, RevisionWriter.Json);
    private static void Bound(int count) { if (count > MaxRows) throw new UseCaseException(ErrorKind.Conflict, "analytics_range_too_dense", "Bu rapor çok yoğun; daha küçük tarih aralığı seçin."); }
    private static UseCaseException ClockConflict() => new(ErrorKind.Conflict, "server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
}
