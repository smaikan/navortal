using Adhd.Application.Common;
using Adhd.Domain.Analytics;

namespace Adhd.Application.Analytics;

public sealed record PlanAnalyticsQuery(DateOnly FromDate, DateOnly ToDate, int StartToleranceSeconds = 60);
public sealed record DelayMetrics(int SampleCount, int LateCount, int EarlyCount, int OnTimeCount, decimal? AverageSignedDelaySeconds, decimal? AverageLateSeconds);
public sealed record EstimateAccuracy(int SampleCount, int ExcludedWithoutRecordedWorkCount, decimal? MeanErrorSeconds, decimal? MeanAbsoluteErrorSeconds);
public sealed record PlanMetrics(decimal PlannedWorkSeconds, decimal ConflictingPlannedSeconds, int ComponentCount, int CompletedComponentCount,
    int UnknownCompletionCount, decimal? CountCompletion, decimal KnownEstimatedSeconds, decimal KnownCompletedEstimatedSeconds, int UnknownEstimateCount,
    decimal? EstimateCoverage, decimal? DurationCompletion, int ConflictingEstimateCount, int MissingSnapshotBlockCount,
    decimal QuotaSeconds, decimal QuotaFulfilledSeconds, decimal? QuotaRatio, decimal UnplannedActualSeconds, EstimateAccuracy Accuracy,
    DelayMetrics FixedStarts, DelayMetrics FlexibleStarts);
public sealed record RevisionReasonCount(string Trigger, string Reason, int Count);
public sealed record DeferReasonCount(string? Reason, bool ReasonAvailable, int Count);
public sealed record PlanAnalyticsDay(DateOnly Date, string PlanTimeZoneId, Guid? DailyPlanId, Guid? BaselineRevisionId, Guid? CurrentRevisionId,
    decimal ActualSeconds, PlanMetrics Baseline, PlanMetrics Current, int RevisionCount, RevisionReasonCount[] RevisionReasons, int DeferCount, DeferReasonCount[] DeferReasons);
public sealed record PlanAnalyticsView(DateOnly FromDate, DateOnly ToDate, DateTimeOffset ServerNow, long PlanningVersion, string ActualTimeZonePolicy,
    int StartToleranceSeconds, decimal ActualSeconds, PlanMetrics Baseline, PlanMetrics Current, int RevisionCount, int DeferCount, int LegacyZoneDeferCount, PlanAnalyticsDay[] Days);
public sealed record EstimateSuggestionSample(Guid TaskId, string Title, DateTimeOffset CompletedAt, long? EstimatedSeconds, decimal ActualSeconds);
public sealed record EstimateSuggestionView(Guid TaskId, DateOnly FromDate, DateOnly ToDate, string ComparisonContext, Guid? ContextId,
    int SampleCount, int ExcludedWithoutWorkCount, int ExcludedUnknownZoneCount, decimal? SuggestedSeconds, string? UnavailableReason, string Method, bool Applied, int SampleLimit,
    EstimateSuggestionSample[] Samples, DateTimeOffset ServerNow);
// Kendi tahmini ve çalışma kaydı olan bitmiş görevlerde gerçekleşen süreyi tahmine böl. Sadece okuma.
public sealed record EstimateAccuracyView(DateOnly FromDate, DateOnly ToDate, int SampleCount, int ExcludedWithoutWorkCount,
    decimal? MedianRatio, decimal? P25Ratio, decimal? P75Ratio, string? UnavailableReason, int MinimumSamples, DateTimeOffset ServerNow);
public interface IPlanAnalyticsStore
{
    Task<EstimateAccuracyView> AccuracyAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct);
    Task<PlanAnalyticsView> ReadAsync(Guid userId, PlanAnalyticsQuery query, CancellationToken ct);
    Task<EstimateSuggestionView> SuggestionAsync(Guid userId, Guid taskId, DateOnly from, DateOnly to, CancellationToken ct);
}
public sealed class PlanAnalyticsService(IPlanAnalyticsStore store)
{
    public Task<PlanAnalyticsView> ReadAsync(Guid userId, PlanAnalyticsQuery q, CancellationToken ct)
    {
        Validate(q.FromDate, q.ToDate); if (q.StartToleranceSeconds is < 0 or > 3600) throw Invalid(); return store.ReadAsync(userId, q, ct);
    }
    public async Task<PlanAnalyticsDay> ReviewAsync(Guid userId, DateOnly date, int tolerance, CancellationToken ct) => (await ReadAsync(userId, new(date, date, tolerance), ct)).Days[0];
    public Task<EstimateSuggestionView> SuggestionAsync(Guid userId, Guid taskId, DateOnly from, DateOnly to, CancellationToken ct) { Validate(from, to); return store.SuggestionAsync(userId, taskId, from, to, ct); }
    public Task<EstimateAccuracyView> AccuracyAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct) { Validate(from, to); return store.AccuracyAsync(userId, from, to, ct); }
    private static void Validate(DateOnly from, DateOnly to) { if (!AnalyticsTime.ValidRange(from, to)) throw Invalid(); }
    private static UseCaseException Invalid() => new(ErrorKind.Validation, "analytics_query_invalid", "1..366 gün ve tolerans0..3600sn seçin.");
}
