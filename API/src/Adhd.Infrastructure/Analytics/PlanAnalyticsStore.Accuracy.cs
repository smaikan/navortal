using System.Data;
using Adhd.Application.Analytics;
using Adhd.Domain.Analytics;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Analytics;

public sealed partial class PlanAnalyticsStore
{
    public const int AccuracyMinimumSamples = 5;

    // Yerel aralıkta bitmiş, bitmeden önce kendi tahmini pozitif ve kayıtlı işi olan görevde oran ömür boyu gerçek/tahmindir. Bilinmeyen tahmin dışarıda kalır, sıfır yapılmaz.
    public async Task<EstimateAccuracyView> AccuracyAsync(Guid userId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow();
        var lower = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var upper = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var events = await db.TaskEvents.AsNoTracking().Where(x => x.UserId == userId && x.EffectiveAt >= lower && x.EffectiveAt < upper && x.EffectiveAt <= now).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(events.Length);
        var candidates = new List<CompletionCandidate>();
        foreach (var e in events)
        {
            var after = AnalyticsHistory.After(e.Payload); var before = AnalyticsHistory.Before(e.Payload);
            if (after?.HasDirectWork != true || !after.DirectWorkCompleted || before?.DirectWorkCompleted == true || after.State is TaskState.Skipped or TaskState.Canceled or TaskState.Deferred) continue;
            if (e.TimeZoneId is null || PlanTime.Date(e.EffectiveAt, e.TimeZoneId) < from || PlanTime.Date(e.EffectiveAt, e.TimeZoneId) > to) continue;
            candidates.Add(new(e.TaskId, after.Title, e.EffectiveAt, e.Sequence, e.TimeZoneId, after, before?.DirectEstimatedSeconds ?? after.DirectEstimatedSeconds));
        }
        // Açılıp yeniden bitirilen görevi bir kere, son bitişiyle say.
        candidates = candidates.Where(x => x.Estimate is > 0).GroupBy(x => x.TaskId).Select(g => g.OrderByDescending(x => x.At).ThenByDescending(x => x.Sequence).First()).ToList();
        var history = await AnalyticsHistory.Read(db, userId, candidates.Select(x => new HistoryKey(x.TaskId, to, x.Zone!)), now, ct);
        var lifetime = (await LifetimeSegments(userId, candidates.Select(x => x.TaskId).ToArray(), now, ct)).ToLookup(x => x.TaskId);
        var ratios = new List<decimal>(); var missing = 0;
        foreach (var c in candidates)
        {
            var state = history.GetValueOrDefault(new(c.TaskId, to, c.Zone!)); if (state?.HasDirectWork != true || !state.DirectWorkCompleted || state.State is TaskState.Skipped or TaskState.Canceled or TaskState.Deferred) continue;
            var seconds = Actual(lifetime[c.TaskId], c.At); if (seconds <= 0) { missing++; continue; }
            ratios.Add(seconds / c.Estimate!.Value);
        }
        var enough = ratios.Count >= AccuracyMinimumSamples;
        return new(from, to, ratios.Count, missing,
            enough ? Round(PlanMetricMath.Median(ratios)) : null, enough ? Round(PlanMetricMath.Percentile(ratios, 0.25m)) : null, enough ? Round(PlanMetricMath.Percentile(ratios, 0.75m)) : null,
            enough ? null : "insufficient_samples", AccuracyMinimumSamples, now);
    }

    private static decimal? Round(decimal? value) => value.HasValue ? Math.Round(value.Value, 4, MidpointRounding.ToEven) : null;
}
