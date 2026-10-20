using System.Data;
using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Recurrence;
using Adhd.Domain.Analytics;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Analytics;

// Rutin analizi salt okunurdur. Sınıflar oluşum kaydı, görev geçmişi ve o günün değişmez tanımından çıkar.
public sealed class RecurrenceAnalyticsStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : IRecurrenceAnalyticsStore
{
    private const int MaxRows = 50000, WeekCount = 12, MonthCount = 6, WeekdayWeeks = 26, HistoryDays = 365, TrendDays = 28;
    private sealed record Day(DateOnly Date, RecurrenceDayClass Class, Guid? TaskId);
    private sealed record Series(RecurrenceTemplate Template, RecurrenceDefinition[] Definitions, RecurrenceDefinition Head, RecurrenceRule Rule, RecurringTaskDefaults Task, DateOnly Today)
    {
        public List<Day> Days { get; } = [];
    }

    public async Task<RecurrenceAnalyticsView> ReadAsync(Guid userId, RecurrenceAnalyticsQuery q, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow(); var weekStartsOn = (await preferences.ReadAsync(userId, ct)).Values.WeekStartsOn;
        var series = await Load(userId, null, now, ct);
        DateOnly Earliest(Series s) { var weeks = Week(s.Today, weekStartsOn).AddDays(-(WeekCount - 1) * 7); return new[] { weeks, q.FromDate, q.CompareFromDate ?? q.FromDate }.Min(); }
        await Fill(userId, series, Earliest, now, ct);
        var rows = series.Select(s => (s, Counts: Count(Inside(s.Days, q.FromDate, q.ToDate)))).ToArray();
        // Pasif rutini ancak bu dönemde bir görevi varsa göster.
        var shown = rows.Where(x => x.s.Template.Enabled || x.Counts.Total > 0 || x.Counts.TodayPending > 0)
            .OrderBy(x => x.Counts.Total >= RecurrenceDayRules.MinimumSamples ? 0 : 1).ThenByDescending(x => x.Counts.Total >= RecurrenceDayRules.MinimumSamples ? x.Counts.Consistency : null)
            .ThenByDescending(x => x.Counts.Total).ThenBy(x => x.s.Task.Title, StringComparer.Ordinal).ThenBy(x => x.s.Template.Id).ToArray();
        var items = shown.Skip(q.Offset).Take(q.Limit).Select(x => new RecurrenceAnalyticsItem(x.s.Template.Id, x.s.Task.Title, x.s.Template.Enabled, x.s.Rule, x.Counts, Weeks(x.s, weekStartsOn))).ToArray();
        var totals = Count(series.SelectMany(s => Inside(s.Days, q.FromDate, q.ToDate)));
        var compare = q.CompareFromDate is { } from ? Count(series.SelectMany(s => Inside(s.Days, from, q.CompareToDate!.Value))) : null;
        return new(q.FromDate, q.ToDate, q.CompareFromDate, q.CompareToDate, weekStartsOn, RecurrenceDayRules.MinimumSamples, rows.Count(x => x.Counts.Total > 0 || x.Counts.TodayPending > 0),
            totals, compare, items, q.Offset, q.Limit, shown.Length, now);
    }

    public async Task<RecurrenceAnalyticsDetail> DetailAsync(Guid userId, Guid templateId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow(); var weekStartsOn = (await preferences.ReadAsync(userId, ct)).Values.WeekStartsOn;
        var series = await Load(userId, templateId, now, ct); if (series.Length == 0) throw new UseCaseException(ErrorKind.NotFound, "recurrence_not_found", "Tekrar şablonu bulunamadı.");
        var s = series[0]; await Fill(userId, series, x => x.Today.AddDays(-HistoryDays), now, ct);
        var ordered = s.Days.OrderBy(x => x.Date).ToArray();
        var months = new DateOnly(s.Today.Year, s.Today.Month, 1).AddMonths(-(MonthCount - 1)); var weekdayStart = Week(s.Today, weekStartsOn).AddDays(-(WeekdayWeeks - 1) * 7);
        var weekdays = Inside(ordered, weekdayStart, s.Today).Where(x => RecurrenceDayRules.Completed(x.Class) || x.Class == RecurrenceDayClass.NotDone).GroupBy(x => (int)x.Date.DayOfWeek)
            .OrderBy(x => (x.Key + 6) % 7).Select(x => new RecurrenceWeekday(x.Key, x.Count(y => RecurrenceDayRules.Completed(y.Class)), x.Count())).ToArray();
        return new(s.Template.Id, s.Task.Title, s.Template.Enabled, s.Rule, s.Today, Inside(ordered, months, s.Today).Select(x => new RecurrenceAnalyticsDay(x.Date, x.Class)).ToArray(), weekdays,
            Count(Inside(ordered, s.Today.AddDays(-(TrendDays - 1)), s.Today)), Count(Inside(ordered, s.Today.AddDays(-(TrendDays * 2 - 1)), s.Today.AddDays(-TrendDays))),
            RecurrenceDayRules.LongestRun(ordered.Select(x => x.Class)), await Work(userId, s, ordered, now, ct), now);
    }

    private async Task<Series[]> Load(Guid user, Guid? id, DateTimeOffset now, CancellationToken ct)
    {
        var templates = await db.RecurrenceTemplates.AsNoTracking().Where(x => x.UserId == user && (id == null || x.Id == id)).ToArrayAsync(ct); var ids = templates.Select(x => x.Id).ToArray();
        var definitions = (await db.RecurrenceDefinitions.AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.TemplateId)).ToArrayAsync(ct)).ToLookup(x => x.TemplateId);
        return templates.Select(t =>
        {
            var rows = definitions[t.Id].OrderBy(x => x.Number).ToArray(); var head = rows[^1]; var rule = Read<RecurrenceRule>(head.Rule);
            return new Series(t, rows, head, rule, Read<RecurringTaskDefaults>(head.TaskDefaults), PlanTime.Date(now, rule.TimeZoneId));
        }).ToArray();
    }

    private async Task Fill(Guid user, Series[] series, Func<Series, DateOnly> earliest, DateTimeOffset now, CancellationToken ct)
    {
        if (series.Length == 0) return;
        var ids = series.Select(x => x.Template.Id).ToArray(); var from = series.Min(earliest); var to = series.Max(x => x.Today);
        var occurrences = await db.RecurrenceOccurrences.AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.TemplateId) && x.LocalDate >= from && x.LocalDate <= to).Take(MaxRows + 1).ToArrayAsync(ct); Bound(occurrences.Length);
        var taskIds = occurrences.Where(x => x.TaskId.HasValue).Select(x => x.TaskId!.Value).ToArray();
        var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == user && taskIds.Contains(x.Id)).Select(x => new { x.Id, x.State, x.DeletedAt, x.CompletedAt }).ToDictionaryAsync(x => x.Id, ct);
        var past = occurrences.Where(x => x.State == OccurrenceState.Materialized && x.TaskId.HasValue).Select(x => new HistoryKey(x.TaskId!.Value, x.LocalDate, x.TimeZoneId)).ToArray();
        var history = await AnalyticsHistory.Read(db, user, past, now, ct); var byTemplate = occurrences.ToLookup(x => x.TemplateId);
        foreach (var s in series)
        {
            var known = new HashSet<DateOnly>(); var start = earliest(s);
            foreach (var o in byTemplate[s.Template.Id].Where(x => x.LocalDate >= start && x.LocalDate <= s.Today))
            {
                known.Add(o.LocalDate); var task = o.TaskId is { } taskId && tasks.TryGetValue(taskId, out var row) && row.DeletedAt is null ? row : null;
                var state = task is null ? null : history.GetValueOrDefault(new(task.Id, o.LocalDate, o.TimeZoneId));
                // Eski kayıtta olay görüntüsü yoksa bitirme saatine bak.
                var done = state is not null ? state.State == TaskState.Completed : task is { State: TaskState.Completed, CompletedAt: { } at } && PlanTime.Date(at, o.TimeZoneId) <= o.LocalDate;
                s.Days.Add(new(o.LocalDate, RecurrenceDayRules.Classify(o.State, o.Reason, task?.State, done, o.LocalDate, s.Today), task?.Id));
            }
            // O gün rutin kuralına uyuyor ama kayıt yoksa rutin pasifti ya da iş çalışmadı. Oluşturulmadan öncesini sayma.
            var created = PlanTime.Date(s.Template.CreatedAt, s.Rule.TimeZoneId); var first = start > created ? start : created;
            for (var date = first; date <= s.Today; date = date.AddDays(1))
                if (!known.Contains(date) && s.Definitions.Where(x => x.EffectiveFrom <= date).MaxBy(x => x.Number) is { } definition && RecurrenceRules.Matches(Read<RecurrenceRule>(definition.Rule), date))
                    s.Days.Add(new(date, RecurrenceDayClass.NotGenerated, null));
        }
    }

    private async Task<RecurrenceWorkSummary> Work(Guid user, Series s, Day[] days, DateTimeOffset now, CancellationToken ct)
    {
        var done = days.Where(x => RecurrenceDayRules.Completed(x.Class) && x.TaskId.HasValue).Select(x => x.TaskId!.Value).Distinct().ToArray();
        var segments = await (from segment in db.WorkSegments.AsNoTracking() join session in db.WorkSessions.AsNoTracking() on new { segment.UserId, Id = segment.SessionId } equals new { session.UserId, session.Id }
                              where segment.UserId == user && !segment.IsVoided && session.TaskId != null && done.Contains(session.TaskId.Value) && segment.StartedAt <= now
                              select new { TaskId = session.TaskId!.Value, segment.StartedAt, segment.EndedAt }).Take(MaxRows + 1).ToArrayAsync(ct); Bound(segments.Length);
        var seconds = segments.GroupBy(x => x.TaskId).ToDictionary(x => x.Key, x => x.Sum(y => Math.Max(0m, ((y.EndedAt ?? now) - y.StartedAt).Ticks / (decimal)TimeSpan.TicksPerSecond))); var worked = seconds.Values.Where(x => x > 0).ToArray();
        return new(worked.Sum(), worked.Length, PlanMetricMath.Ratio(worked.Sum(), worked.Length), done.Length - worked.Length, s.Task.EstimatedSeconds);
    }

    private static RecurrenceWeek[] Weeks(Series s, int weekStartsOn)
    {
        var last = Week(s.Today, weekStartsOn);
        return Enumerable.Range(0, WeekCount).Select(i => last.AddDays(-(WeekCount - 1 - i) * 7)).Select(start => { var c = Count(Inside(s.Days, start, start.AddDays(6))); return new RecurrenceWeek(start, c.Completed, c.Total); }).ToArray();
    }
    private static DateOnly Week(DateOnly date, int weekStartsOn) => AnalyticsTime.BucketStart(date, AnalyticsBucket.Week, weekStartsOn);
    private static IEnumerable<Day> Inside(IEnumerable<Day> days, DateOnly from, DateOnly to) => days.Where(x => x.Date >= from && x.Date <= to);
    private static RecurrenceCounts Count(IEnumerable<Day> days)
    {
        var groups = days.GroupBy(x => x.Class).ToDictionary(x => x.Key, x => x.Count()); int Of(RecurrenceDayClass value) => groups.GetValueOrDefault(value);
        int onTime = Of(RecurrenceDayClass.OnTime), late = Of(RecurrenceDayClass.Late), notDone = Of(RecurrenceDayClass.NotDone), completed = onTime + late, total = completed + notDone;
        return new(onTime, late, notDone, Of(RecurrenceDayClass.TodayPending), Of(RecurrenceDayClass.Skipped), Of(RecurrenceDayClass.NotGenerated), completed, total, PlanMetricMath.Ratio(completed, total));
    }
    private static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, RevisionWriter.Json)!;
    private static void Bound(int count) { if (count > MaxRows) throw new UseCaseException(ErrorKind.Conflict, "analytics_range_too_dense", "Bu rapor çok yoğun; daha kısa bir aralık seç."); }
}
