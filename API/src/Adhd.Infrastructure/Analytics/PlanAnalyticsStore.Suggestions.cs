using System.Data;
using Adhd.Application.Analytics;
using Adhd.Application.Common;
using Adhd.Application.Tasks;
using Adhd.Domain.Analytics;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Analytics;

public sealed partial class PlanAnalyticsStore
{
    private sealed record CompletionCandidate(Guid TaskId, string Title, DateTimeOffset At, long Sequence, string? Zone, TaskView Snapshot, long? Estimate);
    public async Task<EstimateSuggestionView> SuggestionAsync(Guid userId, Guid taskId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow();
        var target = await db.Tasks.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == taskId, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        var template = await db.RecurrenceOccurrences.Where(x => x.UserId == userId && x.TaskId == taskId).Select(x => (Guid?)x.TemplateId).SingleOrDefaultAsync(ct);
        var context = template.HasValue ? "RecurrenceTemplate" : target.CategoryId.HasValue ? "Category" : target.ProjectId.HasValue ? "Project" : "None";
        var contextId = template ?? target.CategoryId ?? target.ProjectId;
        EstimateSuggestionView Result(EstimateSuggestionSample[] samples, int missing, int unknownZone)
        {
            var enough = samples.Length >= 3;
            return new(taskId, from, to, context, contextId, samples.Length, missing, unknownZone, enough ? PlanMetricMath.Median(samples.Select(x => x.ActualSeconds)) : null,
                context == "None" ? "no_comparable_context" : enough ? null : "insufficient_samples", "MedianCompletedComparableActual", false, 20, samples.OrderByDescending(x => x.CompletedAt).ThenBy(x => x.TaskId).Take(20).ToArray(), now);
        }
        if (context == "None") return Result([], 0, 0);
        var lower = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(-1); var upper = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)).AddDays(1);
        var events = await db.TaskEvents.AsNoTracking().Where(x => x.UserId == userId && x.TaskId != taskId && x.EffectiveAt >= lower && x.EffectiveAt < upper && x.EffectiveAt <= now).OrderBy(x => x.Id).Take(MaxRows + 1).ToArrayAsync(ct); Bound(events.Length);
        var candidates = new List<CompletionCandidate>();
        foreach (var e in events)
        {
            var after = AnalyticsHistory.After(e.Payload); var before = AnalyticsHistory.Before(e.Payload);
            if (after?.HasDirectWork != true || !after.DirectWorkCompleted || before?.DirectWorkCompleted == true || after.State is TaskState.Skipped or TaskState.Canceled or TaskState.Deferred) continue;
            candidates.Add(new(e.TaskId, after.Title, e.EffectiveAt, e.Sequence, e.TimeZoneId, after, before?.DirectEstimatedSeconds ?? after.DirectEstimatedSeconds));
        }
        if (template.HasValue)
        {
            var candidateIds = candidates.Select(x => x.TaskId).Distinct().ToArray();
            var members = await db.RecurrenceOccurrences.Where(x => x.UserId == userId && x.TemplateId == template && x.TaskId != null && candidateIds.Contains(x.TaskId.Value)).Select(x => x.TaskId!.Value).ToArrayAsync(ct); var memberIds = members.ToHashSet(); candidates = candidates.Where(x => memberIds.Contains(x.TaskId)).ToList();
        }
        else candidates = candidates.Where(x => context == "Category" ? x.Snapshot.CategoryId == contextId : x.Snapshot.ProjectId == contextId).ToList();
        var unknownZone = candidates.Count(x => x.Zone is null);
        candidates = candidates.Where(x => x.Zone is not null && PlanTime.Date(x.At, x.Zone) >= from && PlanTime.Date(x.At, x.Zone) <= to).GroupBy(x => x.TaskId).Select(g => g.OrderByDescending(x => x.At).ThenByDescending(x => x.Sequence).First()).ToList();
        var history = await AnalyticsHistory.Read(db, userId, candidates.Select(x => new HistoryKey(x.TaskId, to, x.Zone!)), now, ct);
        var lifetime = (await LifetimeSegments(userId, candidates.Select(x => x.TaskId).ToArray(), now, ct)).ToLookup(x => x.TaskId); var samples = new List<EstimateSuggestionSample>(); var missing = 0;
        foreach (var c in candidates)
        {
            var state = history.GetValueOrDefault(new(c.TaskId, to, c.Zone!)); if (state?.HasDirectWork != true || !state.DirectWorkCompleted || state.State is TaskState.Skipped or TaskState.Canceled or TaskState.Deferred) continue;
            var seconds = Actual(lifetime[c.TaskId], c.At); if (seconds <= 0) { missing++; continue; }
            samples.Add(new(c.TaskId, c.Title, c.At, c.Estimate, seconds));
        }
        return Result(samples.ToArray(), missing, unknownZone);
    }
}
