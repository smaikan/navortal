using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator
{
    public async Task<SchedulingApplyOutcome> ApplyDistributionAsync(Guid userId, Guid id, string key, CancellationToken ct)
    {
        var result = await ApplyDistributionCore(userId, id, "distribution-apply", key, new { proposalId = id }, (_, effect) => effect, ct); return new(result.Value, result.Replayed);
    }
    private async Task<(T Value, bool Replayed)> ApplyDistributionCore<T>(Guid userId, Guid id, string scope, string key, object payload,
        Func<DistributionPreviewView, SchedulingApplyResult, T> format, CancellationToken ct) where T : class
    {
        Key(key); var hash = Hash(payload);
        var replay = await Replay<T>(userId, scope, key, hash, ct); if (replay is not null) return (replay, true);
        var stored = await db.SchedulingProposals.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id && x.Kind == "Distribution", ct)
            ?? throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.NotFound, "proposal_not_found", "Öneri bulunamadı.");
        DistributionInput? input = null; DistributionPreviewView? preview = null;
        if (stored.Status != "Applied")
        {
            input = Deserialize<DistributionInput>(stored.Input);
            if (Hash(input) != stored.InputHash) throw Conflict("proposal_stale", "Önerinin girdisi doğrulanamadı; yeniden önizleyin.");
            var output = GenerateDistribution(input); preview = DistributionView(stored.Id, input, output, stored.CreatedAt, stored.ExpiresAt);
            if (Hash(preview) != Hash(Deserialize<DistributionPreviewView>(stored.PublicResult))) throw Conflict("proposal_stale", "Motor veya öneri değişmiş; yeniden önizleyin.");
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        replay = await Replay<T>(userId, scope, key, hash, ct); if (replay is not null) return (replay, true);
        var row = await FindDistribution(userId, id, ct); await db.Entry(row).ReloadAsync(ct); var now = clock.GetUtcNow();
        if (row.Status == "Applied")
        {
            var accepted = format(PublicDistribution(row, now), Deserialize<SchedulingApplyResult>(row.AppliedResult!)); Remember(userId, scope, key, hash, accepted, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return (accepted, true);
        }
        if (input is null || preview is null || row.Status != "Pending" || now < row.CreatedAt || now >= row.ExpiresAt || row.InputHash != stored.InputHash || state.PlanningVersion != row.InputPlanningVersion)
            throw Conflict("proposal_stale", "Plan girdileri veya önerinin geçerlilik zamanı değişmiş; yeniden önizleyin.");
        if (preview.HasConstraintConflicts) throw Conflict("proposal_constraints", "Korunan plan veya aktif çalışma çakışmasını çözün.");
        if (input.ReversesChangeSetId is { } reversed) _ = await MultiUndoSource(userId, reversed, ct);
        var active = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        if (active?.Id != input.Days[0].ActiveSessionId || active?.Version != input.Days[0].ActiveSessionVersion) throw Conflict("proposal_stale", "Aktif çalışma değişmiş; yeniden önizleyin.");
        if (active is not null && input.OutsideBlocks.Any(x => x.IsActive && x.EndsAt <= now)) throw Conflict("proposal_stale", "Aralık dışındaki aktif iş öngörülen bitişini geçti; yeniden önizleyin.");
        var dates = input.Days.Select(x => x.Snapshot.LocalDate).ToArray();
        var plans = await db.DailyPlans.Where(x => x.UserId == userId && dates.Contains(x.LocalDate)).ToListAsync(ct);
        foreach (var day in input.Days)
        {
            var plan = plans.SingleOrDefault(x => x.LocalDate == day.Snapshot.LocalDate);
            if (plan?.Id != day.CurrentPlanId || (plan?.Version ?? 0) != day.CurrentPlanVersion) throw Conflict("proposal_stale", "Günlerden birinin planı değişmiş; yeniden önizleyin.");
        }
        var planIds = plans.Select(x => x.Id).ToArray(); var originals = input.SourceSchedules ?? input.Days.SelectMany(x => x.CurrentSchedules).ToArray(); var sourceIds = originals.Select(x => x.Id).ToArray(); var isUndo = input.ReversesChangeSetId.HasValue;
        var current = await db.TaskSchedules.Where(x => x.UserId == userId && planIds.Contains(x.DailyPlanId) && (x.State == ScheduleState.Planned || isUndo && sourceIds.Contains(x.Id))).ToArrayAsync(ct);
        if (current.Length != originals.Length || current.Any(x => !originals.Any(old => old.Id == x.Id && old.Version == x.Version))) throw Conflict("proposal_stale", "Plan blokları değişmiş; yeniden önizleyin.");
        foreach (var block in preview.Days.SelectMany(x => x.Blocks).Where(x => x.Kind == ScheduleKind.Work))
        {
            var before = block.ExistingScheduleId is { } existingId ? originals.Single(x => x.Id == existingId) : null;
            var actualActive = block.IsActive && active?.TaskId == block.TaskId;
            if (actualActive && block.EndsAt <= now || !actualActive && block.StartsAt < now && (before is null || block.StartsAt != before.StartsAt)) throw Conflict("proposal_stale", "Yeni başlangıç zamanı geçti; yeniden önizleyin.");
        }
        var deltas = new List<PlanDelta>(); var used = preview.Days.SelectMany(x => x.Blocks).Where(x => x.ExistingScheduleId.HasValue).Select(x => x.ExistingScheduleId!.Value).ToHashSet();
        foreach (var removed in current.Where(x => x.State == ScheduleState.Planned && !used.Contains(x.Id)))
        {
            var before = RevisionWriter.View(removed); removed.State = ScheduleState.Removed; removed.Version++; deltas.Add(new(removed, before, "Removed"));
        }
        var metadata = new Dictionary<Guid, string>();
        foreach (var day in preview.Days)
        {
            var plan = plans.SingleOrDefault(x => x.LocalDate == day.LocalDate);
            foreach (var block in day.Blocks)
            {
                if (block.ExistingScheduleId is { } existingId)
                {
                    var existing = current.Single(x => x.Id == existingId); var before = RevisionWriter.View(existing);
                    if (plan is null) throw Conflict("proposal_stale", "Geri yüklenecek bloğun hedef günü bulunamadı.");
                    if (before.State == ScheduleState.Planned && before.DailyPlanId == plan.Id && Same(before, block)) continue;
                    existing.StartsAt = block.StartsAt; existing.EndsAt = block.EndsAt; existing.IsFixed = block.IsFixed; existing.IsLocked = block.IsLocked; existing.IsAutomatic = block.IsAutomatic; existing.State = ScheduleState.Planned; existing.DailyPlanId = plan.Id; existing.Version++;
                    if (before.DailyPlanId != plan.Id && before.State == ScheduleState.Planned)
                    {
                        deltas.Add(new(existing, before, "MovedOut", before.DailyPlanId, before with { State = ScheduleState.Removed, Version = existing.Version }));
                        deltas.Add(new(existing, null, "MovedIn", plan.Id));
                    }
                    else deltas.Add(new(existing, before, before.State == ScheduleState.Removed ? "Restored" : "Updated"));
                }
                else
                {
                    if (plan is null) { plan = new() { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = day.LocalDate, TimeZoneId = day.TimeZoneId }; db.DailyPlans.Add(plan); plans.Add(plan); }
                    string? taskSnapshot = null;
                    if (block.TaskId is { } taskId)
                    {
                        if (!metadata.TryGetValue(taskId, out taskSnapshot))
                        {
                            var task = await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
                            taskSnapshot = Serialize(new PlanningTaskSnapshot(await work.Snapshot(task, state.PlanningVersion, ct), task.State, task.HasDirectWork, task.DirectWorkCompleted, task.RequiredForParent, task.DirectEstimatedSeconds, task.TargetBudgetSeconds)); metadata.Add(taskId, taskSnapshot);
                        }
                    }
                    var added = new TaskSchedule { Id = Guid.CreateVersion7(), UserId = userId, DailyPlanId = plan.Id, TaskId = block.TaskId, Kind = block.Kind, StartsAt = block.StartsAt, EndsAt = block.EndsAt,
                        IsFixed = block.IsFixed, IsLocked = block.IsLocked, IsAutomatic = block.IsAutomatic, TaskSnapshot = taskSnapshot };
                    db.TaskSchedules.Add(added); deltas.Add(new(added, null, "Added"));
                }
            }
        }
        foreach (var group in deltas.Where(x => x.Type == "Added" && x.Before is null && x.Schedule.TaskId.HasValue).GroupBy(x => x.Schedule.TaskId))
        {
            var related = current.Where(x => x.TaskId == group.Key && used.Contains(x.Id)).ToArray(); if (group.Count() + related.Length < 2) continue;
            var groupId = related.Select(x => x.SplitGroupId).FirstOrDefault(x => x.HasValue) ?? Guid.CreateVersion7();
            var origin = related.Select(x => x.OriginScheduleId ?? x.Id).FirstOrDefault(); if (origin == Guid.Empty) origin = group.First().Schedule.Id;
            foreach (var item in group) { item.Schedule.SplitGroupId = groupId; item.Schedule.OriginScheduleId = origin; }
        }
        var changeSet = deltas.Count == 0 ? (Guid?)null : Guid.CreateVersion7(); var revisions = await RevisionWriter.Write(db, userId, deltas, now, isUndo ? "Undo" : "Distribute", isUndo ? "Çok günlük geri alma telafisi uygulandı." : "Seçilen günlere dağıtım uygulandı.", changeSet ?? Guid.Empty, false, ct, preview.AlgorithmVersion, input.ReversesChangeSetId);
        if (deltas.Count > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var result = new SchedulingApplyResult(id, changeSet, state.PlanningVersion, revisions, deltas.Count == 0); row.Status = "Applied"; row.AppliedChangeSetId = changeSet; row.AppliedResult = Serialize(result);
        var response = format(PublicDistribution(row, now), result); Remember(userId, scope, key, hash, response, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return (response, false);
    }
}
