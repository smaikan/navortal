using Adhd.Application.Common;
using Adhd.Domain.Analytics;
using Adhd.Domain.Recurrence;

namespace Adhd.Application.Analytics;

public sealed record RecurrenceAnalyticsQuery(DateOnly FromDate, DateOnly ToDate, DateOnly? CompareFromDate = null, DateOnly? CompareToDate = null, int Offset = 0, int Limit = 50);
// Consistency = (OnTime + Late) / Total. Total yalnız sonucu belli görevleri sayar; boş paydada null.
public sealed record RecurrenceCounts(int OnTime, int Late, int NotDone, int TodayPending, int Skipped, int NotGenerated, int Completed, int Total, decimal? Consistency);
public sealed record RecurrenceWeek(DateOnly WeekStart, int Completed, int Total);
public sealed record RecurrenceAnalyticsItem(Guid TemplateId, string Title, bool Enabled, RecurrenceRule Rule, RecurrenceCounts Counts, RecurrenceWeek[] Weeks);
public sealed record RecurrenceAnalyticsView(DateOnly FromDate, DateOnly ToDate, DateOnly? CompareFromDate, DateOnly? CompareToDate, int WeekStartsOn, int MinimumSamples, int ActiveCount,
    RecurrenceCounts Totals, RecurrenceCounts? Compare, RecurrenceAnalyticsItem[] Items, int Offset, int Limit, int Total, DateTimeOffset ServerNow);
public sealed record RecurrenceAnalyticsDay(DateOnly LocalDate, RecurrenceDayClass Class);
public sealed record RecurrenceWeekday(int WeekDay, int Completed, int Total);
public sealed record RecurrenceWorkSummary(decimal TotalSeconds, int SampleCount, decimal? AverageSeconds, int ExcludedWithoutWorkCount, long? EstimatedSeconds);
public sealed record RecurrenceAnalyticsDetail(Guid TemplateId, string Title, bool Enabled, RecurrenceRule Rule, DateOnly Today, RecurrenceAnalyticsDay[] Days, RecurrenceWeekday[] Weekdays,
    RecurrenceCounts Recent, RecurrenceCounts Prior, int LongestRun, RecurrenceWorkSummary Work, DateTimeOffset ServerNow);

public interface IRecurrenceAnalyticsStore
{
    Task<RecurrenceAnalyticsView> ReadAsync(Guid userId, RecurrenceAnalyticsQuery query, CancellationToken ct);
    Task<RecurrenceAnalyticsDetail> DetailAsync(Guid userId, Guid templateId, CancellationToken ct);
}

public sealed class RecurrenceAnalyticsService(IRecurrenceAnalyticsStore store)
{
    public Task<RecurrenceAnalyticsView> ReadAsync(Guid userId, RecurrenceAnalyticsQuery q, CancellationToken ct)
    {
        var compare = q.CompareFromDate.HasValue == q.CompareToDate.HasValue && (!q.CompareFromDate.HasValue || AnalyticsTime.ValidRange(q.CompareFromDate.Value, q.CompareToDate!.Value));
        if (!AnalyticsTime.ValidRange(q.FromDate, q.ToDate) || !compare || q.Offset is < 0 or > 100000 || q.Limit is < 1 or > 100)
            throw new UseCaseException(ErrorKind.Validation, "analytics_query_invalid", "1..366 gün, birlikte verilen karşılaştırma aralığı ve geçerli sayfa seçin.");
        return store.ReadAsync(userId, q, ct);
    }
    public Task<RecurrenceAnalyticsDetail> DetailAsync(Guid userId, Guid templateId, CancellationToken ct) => store.DetailAsync(userId, templateId, ct);
}
