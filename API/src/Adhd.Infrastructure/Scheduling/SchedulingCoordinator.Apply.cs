using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator
{
    private async Task<(T Value, bool Replayed)> ApplyCore<T>(Guid userId, Guid proposalId, string scope, string key, object payload,
        Func<SchedulingPreviewView, SchedulingApplyResult, T> format, CancellationToken ct) where T : class
    {
        Key(key); var hash = Hash(payload);
        var replay = await Replay<T>(userId, scope, key, hash, ct); if (replay is not null) return (replay, true);
        // Hesabı ve tutarlılık kontrolünü kısa hesap kilidini almadan yap.
        var stored = await db.SchedulingProposals.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Id == proposalId && x.Kind == "Day", ct)
            ?? throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.NotFound, "proposal_not_found", "Öneri bulunamadı.");
        // Makbuz kabul edildiyse motor ya da girdi şeması değişse de tekrar hesaplama.
        if (stored.Status == "Applied")
        {
            await using var replayTx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct);
            replay = await Replay<T>(userId, scope, key, hash, ct); if (replay is not null) return (replay, true);
            var accepted = await Find(userId, proposalId, ct); await db.Entry(accepted).ReloadAsync(ct); var replayNow = clock.GetUtcNow();
            var receipt = format(Public(accepted, replayNow), Deserialize<SchedulingApplyResult>(accepted.AppliedResult!));
            Remember(userId, scope, key, hash, receipt, replayNow); await db.SaveChangesAsync(ct); await replayTx.CommitAsync(ct); return (receipt, true);
        }
        var input = Deserialize<SchedulingInput>(stored.Input);
        if (Hash(input) != stored.InputHash) throw Conflict("proposal_stale", "Önerinin girdisi doğrulanamadı; yeniden önizleyin.");
        var output = Generate(input);
        var initial = Deserialize<SchedulingPreviewView>(stored.PublicResult);
        var verified = initial with { Blocks = output.Blocks, Changes = Differences(input.CurrentSchedules, output.Blocks), Unplaced = output.Unplaced,
            Warnings = output.Warnings, Explanations = output.Explanations, AlgorithmVersion = output.AlgorithmVersion,
            AnchorAt = output.AnchorAt, InputVersion = output.InputPlanningVersion, HasConstraintConflicts = output.HasConstraintConflicts, CanApply = !output.HasConstraintConflicts,
            ReversesChangeSetId = input.Undo?.ChangeSetId, IsPartial = input.Undo is not null && output.Warnings.Length > 0 };
        if (Hash(initial) != Hash(verified)) throw Conflict("proposal_stale", "Motor veya öneri değişmiş; yeniden önizleyin.");
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        replay = await Replay<T>(userId, scope, key, hash, ct); if (replay is not null) return (replay, true);
        var row = await Find(userId, proposalId, ct); await db.Entry(row).ReloadAsync(ct); var now = clock.GetUtcNow();
        if (row.Status == "Applied")
        {
            var previous = format(Public(row, now), Deserialize<SchedulingApplyResult>(row.AppliedResult!));
            Remember(userId, scope, key, hash, previous, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return (previous, true);
        }
        if (row.Status != "Pending" || now < row.CreatedAt || now >= row.ExpiresAt || state.PlanningVersion != row.InputPlanningVersion
            || row.InputPlanningVersion != input.Snapshot.PlanningVersion || row.InputHash != stored.InputHash)
            throw Conflict("proposal_stale", "Plan girdileri veya önerinin geçerlilik zamanı değişmiş; yeniden önizleyin.");
        if (output.HasConstraintConflicts) throw Conflict("proposal_constraints", "Korunan plan veya aktif çalışma çakışmasını çözün; yeniden önizleyin.");
        if (input.Undo is { } undo) _ = await UndoSource(userId, undo.ChangeSetId, ct);
        var active = await db.WorkSessions.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        if (active?.Id != input.ActiveSessionId || active?.Version != input.ActiveSessionVersion)
            throw Conflict("proposal_stale", "Aktif oturum değişmiş; yeniden önizleyin.");
        var plan = await db.DailyPlans.SingleOrDefaultAsync(x => x.UserId == userId && x.LocalDate == row.LocalDate, ct);
        if (plan?.Id != input.CurrentPlanId || (plan?.Version ?? 0) != input.CurrentPlanVersion) throw Conflict("proposal_stale", "Gün planı değişmiş; yeniden önizleyin.");
        var planId = plan?.Id;
        var sourceIds = input.CurrentSchedules.Select(x => x.Id).ToArray(); var isUndo = input.Undo is not null;
        var current = await db.TaskSchedules.Where(x => x.UserId == userId && x.DailyPlanId == planId && (x.State == ScheduleState.Planned || isUndo && sourceIds.Contains(x.Id))).ToArrayAsync(ct);
        if (current.Length != input.CurrentSchedules.Length || current.Any(x => !input.CurrentSchedules.Any(old => old.Id == x.Id && old.Version == x.Version)))
            throw Conflict("proposal_stale", "Plan blokları değişmiş; yeniden önizleyin.");
        foreach (var block in output.Blocks.Where(x => x.Kind == ScheduleKind.Work))
        {
            var before = block.ExistingScheduleId is { } id ? input.CurrentSchedules.Single(x => x.Id == id) : null;
            var actualActive = block.IsActive && active is not null && active.TaskId == block.TaskId;
            if (actualActive && block.EndsAt <= now || !actualActive && block.StartsAt < now && (before is null || block.StartsAt != before.StartsAt))
                throw Conflict("proposal_stale", "Önerideki yeni başlangıç zamanı geçti; yeniden önizleyin.");
        }
        var deltas = new List<PlanDelta>();
        var used = output.Blocks.Where(x => x.ExistingScheduleId.HasValue).Select(x => x.ExistingScheduleId!.Value).ToHashSet();
        foreach (var removed in current.Where(x => x.State == ScheduleState.Planned && !used.Contains(x.Id)))
        {
            var before = RevisionWriter.View(removed); removed.State = ScheduleState.Removed; removed.Version++; deltas.Add(new(removed, before, "Removed"));
        }
        foreach (var block in output.Blocks)
        {
            if (block.ExistingScheduleId is { } id)
            {
                var existing = current.Single(x => x.Id == id); var before = RevisionWriter.View(existing); if (before.State == ScheduleState.Planned && Same(before, block)) continue;
                existing.StartsAt = block.StartsAt; existing.EndsAt = block.EndsAt; existing.IsFixed = block.IsFixed; existing.IsLocked = block.IsLocked;
                existing.IsAutomatic = block.IsAutomatic; existing.State = ScheduleState.Planned; existing.Version++; deltas.Add(new(existing, before, before.State == ScheduleState.Removed ? "Restored" : "Updated"));
            }
            else
            {
                if (plan is null) { plan = new() { Id = Guid.CreateVersion7(), UserId = userId, LocalDate = row.LocalDate, TimeZoneId = input.Snapshot.TimeZoneId }; db.DailyPlans.Add(plan); }
                string? metadata = null;
                if (block.TaskId is { } taskId)
                {
                    var task = await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
                    metadata = Serialize(new PlanningTaskSnapshot(await work.Snapshot(task, state.PlanningVersion, ct), task.State, task.HasDirectWork, task.DirectWorkCompleted, task.RequiredForParent, task.DirectEstimatedSeconds, task.TargetBudgetSeconds, task.Priority, task.EnergyDemand));
                }
                var added = new TaskSchedule { Id = Guid.CreateVersion7(), UserId = userId, DailyPlanId = plan.Id, TaskId = block.TaskId, Kind = block.Kind,
                    StartsAt = block.StartsAt, EndsAt = block.EndsAt, IsFixed = block.IsFixed, IsLocked = block.IsLocked, IsAutomatic = block.IsAutomatic, TaskSnapshot = metadata };
                db.TaskSchedules.Add(added); deltas.Add(new(added, null, "Added"));
            }
        }
        foreach (var group in deltas.Where(x => x.Before is null && x.Schedule.TaskId.HasValue).GroupBy(x => x.Schedule.TaskId))
        {
            var related = current.Where(x => x.TaskId == group.Key && used.Contains(x.Id)).ToArray();
            if (group.Count() + related.Length < 2) continue;
            var groupId = related.Select(x => x.SplitGroupId).FirstOrDefault(x => x.HasValue) ?? Guid.CreateVersion7();
            var origin = related.Select(x => x.OriginScheduleId ?? x.Id).FirstOrDefault(); if (origin == Guid.Empty) origin = group.First().Schedule.Id;
            foreach (var item in group) { item.Schedule.SplitGroupId = groupId; item.Schedule.OriginScheduleId = origin; }
        }
        var changeSet = deltas.Count == 0 ? (Guid?)null : Guid.CreateVersion7();
        var revisions = await RevisionWriter.Write(db, userId, deltas, now, isUndo ? "Undo" : "Replan", isUndo ? "Geleceğe dönük geri alma telafisi uygulandı." : "Günlük plan önerisi uygulandı.", changeSet ?? Guid.Empty, false, ct, output.AlgorithmVersion, input.Undo?.ChangeSetId);
        if (deltas.Count > 0) { state.PlanningVersion++; state.UpdatedAt = now; }
        var effect = new SchedulingApplyResult(proposalId, changeSet, state.PlanningVersion, revisions, deltas.Count == 0);
        row.Status = "Applied"; row.AppliedChangeSetId = changeSet; row.AppliedResult = Serialize(effect);
        var response = format(Public(row, now), effect); Remember(userId, scope, key, hash, response, now);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return (response, false);
    }
}
