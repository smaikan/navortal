using System.Collections.Immutable;
using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

internal sealed record CrossDayUndoMove(Guid ScheduleId, Guid OriginalPlanId);
internal sealed record DistributionInput(SchedulingInput[] Days, Guid[] TaskIds, SchedulingBlock[] OutsideBlocks,
    Adhd.Application.Planning.ScheduleView[]? SourceSchedules = null, Guid? ReversesChangeSetId = null, CrossDayUndoMove[]? Moves = null);
public sealed partial class SchedulingCoordinator
{
    public async Task<DistributionPreviewView> PreviewDistributionAsync(Guid userId, DistributionRequest request, CancellationToken ct)
    {
        if (request.FromDate.Year is < 2 or > 9998 || request.ToDate.Year is < 2 or > 9998 || request.ToDate.DayNumber - request.FromDate.DayNumber is < 0 or > 30
            || request.TaskIds is null || request.TaskIds.Length is < 1 or > 1000 || request.TaskIds.Distinct().Count() != request.TaskIds.Length || request.ExpectedPlanningVersion < 0)
            throw new UseCaseException(ErrorKind.Validation, "distribution_range_invalid", "Açık1..31 günlük aralık ve1..1000 benzersiz görev seçin.");
        DistributionInput input;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct))
        {
            var now = clock.GetUtcNow(); var builder = new SchedulingSnapshotBuilder(db, preferences, clock); var days = new List<SchedulingInput>();
            for (var date = request.FromDate; date <= request.ToDate; date = date.AddDays(1))
                days.Add(await builder.Build(userId, new(date, request.TaskIds, request.ExpectedPlanningVersion), ct, useExistingTransaction: true, capturedNow: now));
            var ids = days.Where(x => x.CurrentPlanId.HasValue).Select(x => x.CurrentPlanId!.Value).ToArray();
            var outside = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && !ids.Contains(x.DailyPlanId) && x.State == ScheduleState.Planned && x.EndsAt > now)
                .OrderBy(x => x.Id).Select(x => new SchedulingBlock(x.Id, x.TaskId, x.Kind, x.StartsAt, x.EndsAt, x.IsFixed, x.IsLocked, false, false, x.IsAutomatic)).ToListAsync(ct);
            var active = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
            var capturesActive = days.Any(x => x.Snapshot.ExistingBlocks.Any(b => b.IsActive));
            if (active?.TaskId is { } taskId && !capturesActive)
            {
                var end = days.Max(x => PlanTime.DayStart(x.Snapshot.LocalDate.AddDays(1), x.Snapshot.TimeZoneId));
                if (end > now)
                {
                    var task = days[0].Snapshot.Tasks.Single(x => x.Id == taskId); var remaining = task.EstimatedSeconds is { } estimate ? Math.Max(0, estimate - task.ActualSeconds) : (decimal?)null;
                    var available = WorkTime.Seconds(now, end); var duration = remaining is > 0 ? Math.Min(remaining.Value, available) : available;
                    var original = outside.FirstOrDefault(x => x.ExistingScheduleId == active.StartedScheduleId);
                    if (original is not null)
                    {
                        outside.Remove(original);
                        // Takvimdeki koruma kalsın. Miktarı canlı öngörüye bir kere ekle
                        if (original.IsFixed || original.IsLocked) outside.Add(original with { TaskId = null, Kind = ScheduleKind.Break });
                    }
                    outside.Add(new(null, taskId, ScheduleKind.Work, now, now.AddTicks((long)(duration * TimeSpan.TicksPerSecond)), IsActive: true, IsAutomatic: true));
                }
            }
            input = new(days.ToArray(), request.TaskIds.Order().ToArray(), outside.ToArray()); await tx.CommitAsync(ct);
        }
        var output = GenerateDistribution(input); var id = Guid.CreateVersion7(); var created = input.Days[0].Snapshot.ServerNow;
        var view = DistributionView(id, input, output, created, created.AddMinutes(2));
        db.SchedulingProposals.Add(new() { Id = id, UserId = userId, Kind = "Distribution", LocalDate = request.FromDate, InputPlanningVersion = output.InputPlanningVersion,
            CreatedAt = created, ExpiresAt = view.ExpiresAt, InputHash = Hash(input), Input = Serialize(input), PublicResult = Serialize(view) });
        await db.SaveChangesAsync(ct); return view;
    }
    private DistributionProposal GenerateDistribution(DistributionInput input)
    {
        if (input.ReversesChangeSetId.HasValue) return GenerateMultiUndo(input);
        var output = distributionEngine.Generate(new(input.Days.Select(x => x.Snapshot).ToImmutableArray(), input.TaskIds.ToImmutableArray(), input.OutsideBlocks.ToImmutableArray(), input.Days[0].Intent.NewWorkNotBefore));
        return output with { Days = output.Days.Select(day => day with { Proposal = MatchExisting(day.Proposal, input.Days.Single(x => x.Snapshot.LocalDate == day.LocalDate).CurrentSchedules) }).ToImmutableArray() };
    }
    private static DistributionPreviewView DistributionView(Guid id, DistributionInput input, DistributionProposal output, DateTimeOffset created, DateTimeOffset expires) =>
        new(id, output.InputPlanningVersion, created, expires, input.Days[0].PlanningMode, output.AlgorithmVersion, "Pending", !output.HasConstraintConflicts, output.HasConstraintConflicts,
            output.Days.Select(d => new DistributionDayView(d.LocalDate, d.TimeZoneId, d.Proposal.Blocks,
                Differences(input.Days.Single(x => x.Snapshot.LocalDate == d.LocalDate).CurrentSchedules, d.Proposal.Blocks), d.Proposal.Unplaced, d.Proposal.Warnings, d.Proposal.Explanations)).ToArray(), output.Unplaced,
            ReversesChangeSetId: input.ReversesChangeSetId, IsPartial: input.ReversesChangeSetId.HasValue && output.Days.Any(x => x.Proposal.Warnings.Length > 0));
    public async Task<DistributionPreviewView> GetDistributionAsync(Guid userId, Guid id, CancellationToken ct) => PublicDistribution(await FindDistribution(userId, id, ct), clock.GetUtcNow());
    public async Task<DistributionOutcome> PlanDistributionAsync(Guid userId, DistributionRequest request, string key, CancellationToken ct)
    {
        Key(key); const string scope = "distribution-plan"; var payload = new { request.FromDate, request.ToDate, taskIds = request.TaskIds?.Order().ToArray(), request.ExpectedPlanningVersion }; var hash = Hash(payload);
        var replay = await Replay<DistributionPreviewView>(userId, scope, key, hash, ct); if (replay is not null) return new(replay, true);
        DistributionPreviewView preview;
        try { preview = await PreviewDistributionAsync(userId, request, ct); }
        catch (UseCaseException ex) when (ex.Kind == ErrorKind.Conflict)
        {
            replay = await Replay<DistributionPreviewView>(userId, scope, key, hash, ct); if (replay is not null) return new(replay, true); throw;
        }
        if (preview.PlanningMode == "Auto" && !preview.HasConstraintConflicts)
        {
            var effect = await ApplyDistributionCore(userId, preview.ProposalId, scope, key, payload, (view, applied) => view with { Status = "Applied", CanApply = false, Applied = applied }, ct);
            return new(effect.Value, effect.Replayed);
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct);
        replay = await Replay<DistributionPreviewView>(userId, scope, key, hash, ct); if (replay is not null) return new(replay, true);
        Remember(userId, scope, key, hash, preview, clock.GetUtcNow()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(preview, false);
    }
    private DistributionPreviewView PublicDistribution(SchedulingProposalRecord row, DateTimeOffset now)
    {
        var view = Deserialize<DistributionPreviewView>(row.PublicResult); var expired = row.Status != "Applied" && now >= row.ExpiresAt;
        return view with { Status = row.Status == "Applied" ? "Applied" : expired ? "Expired" : row.Status, CanApply = row.Status == "Pending" && !expired && !view.HasConstraintConflicts,
            Applied = row.AppliedResult is null ? null : Deserialize<SchedulingApplyResult>(row.AppliedResult) };
    }
    private async Task<SchedulingProposalRecord> FindDistribution(Guid userId, Guid id, CancellationToken ct) => await db.SchedulingProposals.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id && x.Kind == "Distribution", ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "proposal_not_found", "Öneri bulunamadı.");
}
