using Adhd.Application.Common;
using Adhd.Domain.Analytics;

namespace Adhd.Application.Analytics;

public sealed record ActualAnalyticsQuery(DateOnly FromDate, DateOnly ToDate, AnalyticsBucket Bucket = AnalyticsBucket.Day);
public sealed record FocusMetrics(decimal ActiveSeconds, decimal OvertimeSeconds, int ActiveCycleCount, int StartedCount,
    int FinishedCount, int EffectiveTargetsReached, int RecordedTargetsReached, decimal? AverageActiveSeconds);
public sealed record ActualMetrics(decimal WorkSeconds, decimal TaskWorkSeconds, decimal GeneralWorkSeconds, decimal ManualWorkSeconds,
    int SessionCount, int SegmentCount, decimal MissingSnapshotSeconds, FocusMetrics Focus, decimal EstimatedCompletedSeconds = 0, int EstimatedCompletedCount = 0);
public sealed record ActualBucketView(DateOnly BucketStart, DateOnly FromDate, DateOnly ToDate, string[] SourceTimeZones, ActualMetrics Metrics);
public sealed record ActualAnalyticsView(DateOnly FromDate, DateOnly ToDate, AnalyticsBucket Bucket, int WeekStartsOn, string TimeZonePolicy,
    DateTimeOffset ServerNow, long PlanningVersion, string[] SourceTimeZones, ActualMetrics Totals, ActualBucketView[] Buckets);
public sealed record ActualBreakdownItem(Guid? Id, string Label, bool SnapshotAvailable, decimal WorkSeconds, int SessionCount, decimal EstimatedCompletedSeconds = 0);
public sealed record ActualBreakdownPage(DateOnly FromDate, DateOnly ToDate, AnalyticsDimension Dimension, string TimeZonePolicy,
    DateTimeOffset ServerNow, decimal TotalWorkSeconds, ActualBreakdownItem[] Items, int Offset, int Limit, int Total, decimal TotalEstimatedCompletedSeconds = 0);
public interface IActualAnalyticsStore
{
    Task<ActualAnalyticsView> ReadAsync(Guid userId, ActualAnalyticsQuery query, CancellationToken ct);
    Task<ActualBreakdownPage> BreakdownAsync(Guid userId, ActualAnalyticsQuery query, AnalyticsDimension dimension, int offset, int limit, CancellationToken ct);
}
public sealed class ActualAnalyticsService(IActualAnalyticsStore store)
{
    public Task<ActualAnalyticsView> ReadAsync(Guid userId, ActualAnalyticsQuery query, CancellationToken ct) { Validate(query); return store.ReadAsync(userId, query, ct); }
    public Task<ActualBreakdownPage> BreakdownAsync(Guid userId, ActualAnalyticsQuery query, AnalyticsDimension dimension, int offset, int limit, CancellationToken ct)
    {
        Validate(query); if (!Enum.IsDefined(dimension) || offset is < 0 or > 100000 || limit is < 1 or > 100) throw Invalid();
        return store.BreakdownAsync(userId, query, dimension, offset, limit, ct);
    }
    private static void Validate(ActualAnalyticsQuery q) { if (!AnalyticsTime.ValidRange(q.FromDate, q.ToDate) || !Enum.IsDefined(q.Bucket)) throw Invalid(); }
    private static UseCaseException Invalid() => new(ErrorKind.Validation, "analytics_query_invalid", "1..366 gün, geçerli gruplama ve limit1..100/offset0..100000 seçin.");
}
