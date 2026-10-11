using System.Collections.Immutable;
using System.Data;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Scheduling;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator
{
    public async Task<DistributionPreviewView> PreviewMultiUndoAsync(Guid userId, UndoRequest request, CancellationToken ct)
    {
        DistributionInput input;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct))
        {
            var revisions = await MultiUndoSource(userId, request.ChangeSetId, ct); var planIds = revisions.Select(x => x.DailyPlanId).ToArray();
            var plans = await db.DailyPlans.AsNoTracking().Where(x => x.UserId == userId && planIds.Contains(x.Id)).OrderBy(x => x.LocalDate).ToArrayAsync(ct);
            var now = clock.GetUtcNow(); var builder = new SchedulingSnapshotBuilder(db, preferences, clock); var days = new List<SchedulingInput>();
            foreach (var plan in plans) days.Add(await builder.Build(userId, new(plan.LocalDate, [], request.ExpectedPlanningVersion), ct, allowEmpty: true, useExistingTransaction: true, capturedNow: now));
            var revisionIds = revisions.Select(x => x.Id).ToArray(); var changes = await db.PlanRevisionChanges.AsNoTracking().Where(x => x.UserId == userId && revisionIds.Contains(x.RevisionId)).OrderBy(x => x.ScheduleId).ToArrayAsync(ct);
            if (changes.Any(x => x.ScheduleId is null)) throw Conflict("undo_use_day_items", "Saatsiz plan değişikliğini gün öğesi geri almasıyla geri alın.");
            var changedIds = changes.Select(x => x.ScheduleId!.Value).Distinct().ToArray();
            var physical = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && (planIds.Contains(x.DailyPlanId) && x.State == ScheduleState.Planned || changedIds.Contains(x.Id))).OrderBy(x => x.Id).ToArrayAsync(ct);
            var outside = await db.TaskSchedules.AsNoTracking().Where(x => x.UserId == userId && !planIds.Contains(x.DailyPlanId) && x.State == ScheduleState.Planned && x.EndsAt > now).OrderBy(x => x.Id)
                .Select(x => new SchedulingBlock(x.Id, x.TaskId, x.Kind, x.StartsAt, x.EndsAt, x.IsFixed, x.IsLocked, false, false, x.IsAutomatic)).ToArrayAsync(ct);
            // Bu geri almada başka satırlar da kalkabilir. Önce dokunmadığımız satırlara yer ayır,
            // sonra kısmi geri almanın kapasiteyi veya bağımlılığı bozmadığını kontrol et
            foreach (var (day, index) in days.Select((x, i) => (x, i)).ToArray())
            {
                var revisionId = revisions.Single(x => x.DailyPlanId == day.CurrentPlanId).Id; var local = changes.Where(x => x.RevisionId == revisionId).ToArray();
                var rows = day.CurrentSchedules.ToList();
                foreach (var change in local.Where(x => rows.All(r => r.Id != x.ScheduleId)))
                {
                    var row = physical.Single(x => x.Id == change.ScheduleId);
                    rows.Add(RevisionWriter.View(row) with { DailyPlanId = day.CurrentPlanId!.Value, State = ScheduleState.Removed });
                }
                var other = outside.Concat(physical.Where(x => x.DailyPlanId != day.CurrentPlanId && x.State == ScheduleState.Planned && !changedIds.Contains(x.Id)).Select(x => new SchedulingBlock(x.Id, x.TaskId, x.Kind, x.StartsAt, x.EndsAt, x.IsFixed, x.IsLocked, IsAutomatic: x.IsAutomatic))).Where(x => x.EndsAt > now).ToArray();
                var held = other.Where(x => x.TaskId.HasValue && x.Kind == ScheduleKind.Work).ToLookup(x => x.TaskId!.Value);
                var tasks = day.Snapshot.Tasks.Select(t => t with { OutsideReservedSeconds = held[t.Id].Sum(x => WorkTime.Seconds(x.StartsAt > now ? x.StartsAt : now, x.EndsAt)), OutsideCompletionAt = held[t.Id].Any() ? held[t.Id].Max(x => x.EndsAt) : null }).ToImmutableArray();
                var start = PlanTime.DayStart(day.Snapshot.LocalDate, day.Snapshot.TimeZoneId); var end = PlanTime.DayStart(day.Snapshot.LocalDate.AddDays(1), day.Snapshot.TimeZoneId);
                var busy = other.Select(x => new SchedulingWindow(x.StartsAt > start ? x.StartsAt : start, x.EndsAt < end ? x.EndsAt : end)).Where(x => x.StartsAt < x.EndsAt).ToImmutableArray();
                days[index] = day with { CurrentSchedules = rows.OrderBy(x => x.Id).ToArray(), Snapshot = day.Snapshot with { Tasks = tasks, ExternalBusyWindows = busy, ExternalWorkBlocks = other.Where(x => x.Kind == ScheduleKind.Work).ToImmutableArray() },
                    Undo = new(request.ChangeSetId, local.Select(x => new UndoDelta(x.Before is null ? null : UndoView(Deserialize<ScheduleView>(x.Before)), UndoView(Deserialize<ScheduleView>(x.After!)))).ToArray(), request.AllowProtectedChange) };
            }
            var moves = changes.Where(x => x.Type == "MovedOut" && x.Before is not null).Select(x => new CrossDayUndoMove(x.ScheduleId!.Value, Deserialize<ScheduleView>(x.Before!).DailyPlanId)).ToArray();
            input = new(days.ToArray(), [], outside, physical.Select(RevisionWriter.View).ToArray(), request.ChangeSetId, moves); await tx.CommitAsync(ct);
        }
        var output = GenerateDistribution(input); var id = Guid.CreateVersion7(); var created = input.Days[0].Snapshot.ServerNow; var view = DistributionView(id, input, output, created, created.AddMinutes(2));
        db.SchedulingProposals.Add(new() { Id = id, UserId = userId, Kind = "Distribution", LocalDate = input.Days[0].Snapshot.LocalDate, InputPlanningVersion = output.InputPlanningVersion,
            CreatedAt = created, ExpiresAt = view.ExpiresAt, InputHash = Hash(input), Input = Serialize(input), PublicResult = Serialize(view), ReversesChangeSetId = request.ChangeSetId });
        await db.SaveChangesAsync(ct); return view;
    }
    private async Task<PlanRevision[]> MultiUndoSource(Guid userId, Guid changeSetId, CancellationToken ct)
    {
        var source = await db.PlanRevisions.AsNoTracking().Where(x => x.UserId == userId && x.ChangeSetId == changeSetId).ToArrayAsync(ct);
        if (source.Length == 0) throw new UseCaseException(ErrorKind.NotFound, "change_set_not_found", "Değişiklik grubu bulunamadı.");
        if (source.Length > 31 || source.Any(x => x.Trigger == "TaskState")) throw Conflict("undo_source_invalid", "Bu grup geri alınabilir bir kullanıcı plan işlemi değil.");
        var ids = source.Select(x => x.DailyPlanId).ToArray();
        var latest = await db.PlanRevisions.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.DailyPlanId) && x.Trigger != "TaskState").GroupBy(x => x.DailyPlanId).Select(g => new { Id = g.Key, Number = g.Max(x => x.Number) }).ToArrayAsync(ct);
        if (source.Any(x => latest.Single(y => y.Id == x.DailyPlanId).Number != x.Number)) throw Conflict("undo_not_latest", "Etkilenen günlerin birinde daha yeni kullanıcı plan kararı var.");
        if (await db.SchedulingProposals.AsNoTracking().AnyAsync(x => x.UserId == userId && x.ReversesChangeSetId == changeSetId && x.Status == "Applied", ct)) throw Conflict("undo_already_applied", "Bu grup için geri alma kabul edilmiş.");
        return source;
    }
    private DistributionProposal GenerateMultiUndo(DistributionInput input)
    {
        var results = input.Days.Select(day => new DistributedDay(day.Snapshot.LocalDate, day.Snapshot.TimeZoneId, Generate(day))).ToArray();
        foreach (var move in input.Moves ?? [])
        {
            var physical = input.SourceSchedules!.Single(x => x.Id == move.ScheduleId); if (physical.State != ScheduleState.Planned) continue;
            var original = Array.FindIndex(input.Days, x => x.CurrentPlanId == move.OriginalPlanId); var current = Array.FindIndex(input.Days, x => x.CurrentPlanId == physical.DailyPlanId);
            var locations = results.Select((day, i) => (day, i)).Where(x => x.day.Proposal.Blocks.Any(b => b.ExistingScheduleId == move.ScheduleId)).Select(x => x.i).ToArray();
            if (locations.Length == 1 && locations[0] == original) continue;
            for (var i = 0; i < results.Length; i++) results[i] = results[i] with { Proposal = results[i].Proposal with {
                Blocks = results[i].Proposal.Blocks.Where(x => x.ExistingScheduleId != move.ScheduleId).ToImmutableArray(),
                Explanations = results[i].Proposal.Explanations.Where(x => x.ScheduleId != move.ScheduleId).ToImmutableArray() } };
            var kept = UndoView(physical).Block(); results[current] = results[current] with { Proposal = results[current].Proposal with { Blocks = results[current].Proposal.Blocks.Add(kept), Warnings = results[current].Proposal.Warnings.Add(new("UndoCrossDayMoveIncomplete", physical.TaskId, ScheduleId: physical.Id)) } };
        }
        return ValidateMultiUndo(input, results);
    }
    private static DistributionProposal ValidateMultiUndo(DistributionInput input, DistributedDay[] results)
    {
        var now = input.Days[0].Snapshot.ServerNow; var originals = input.SourceSchedules!; var proposed = results.SelectMany((d, i) => d.Proposal.Blocks.Select(b => (Block: b, Day: i))).ToArray(); var invalid = false;
        foreach (var item in proposed)
        {
            var before = originals.Single(x => x.Id == item.Block.ExistingScheduleId);
            if (before.State == ScheduleState.Planned && before.DailyPlanId == input.Days[item.Day].CurrentPlanId && Same(before, item.Block)) continue;
            if (proposed.Any(other => other.Day != item.Day && other.Block.StartsAt < item.Block.EndsAt && item.Block.StartsAt < other.Block.EndsAt)) invalid = true;
        }
        foreach (var task in input.Days[0].Snapshot.Tasks)
        {
            decimal Amount(IEnumerable<Adhd.Domain.Scheduling.SchedulingBlock> blocks) => blocks.Where(x => x.TaskId == task.Id && x.Kind == ScheduleKind.Work && x.EndsAt > now).Sum(x => WorkTime.Seconds(x.StartsAt > now ? x.StartsAt : now, x.EndsAt));
            var old = Amount(originals.Where(x => x.State == ScheduleState.Planned).Select(x => UndoView(x).Block())); var next = Amount(proposed.Select(x => x.Block)); var outside = Amount(input.OutsideBlocks);
            var remaining = Math.Max(0, (task.EstimatedSeconds ?? 0) - task.ActualSeconds - outside); if (next > Math.Max(old, remaining)) invalid = true;
        }
        // Gün toplamlarını yeniden çıkarma. Motorun bütün aralık için hesapladığı önkoşulları kullan
        var snapshot = input.Days[0].Snapshot with { Tasks = input.Days[0].Snapshot.Tasks.Select(t => t with {
            OutsideReservedSeconds = input.OutsideBlocks.Where(b => b.TaskId == t.Id && b.Kind == ScheduleKind.Work && b.EndsAt > now).Sum(b => WorkTime.Seconds(b.StartsAt > now ? b.StartsAt : now, b.EndsAt)),
            OutsideCompletionAt = input.OutsideBlocks.Where(b => b.TaskId == t.Id && b.Kind == ScheduleKind.Work && b.EndsAt > now).Select(b => (DateTimeOffset?)b.EndsAt).Max() }).ToImmutableArray() };
        if (PlanUndoEngine.IntroducesDependencyViolation(snapshot, originals.Where(x => x.State == ScheduleState.Planned).Select(x => UndoView(x).Block()), proposed.Select(x => x.Block))) invalid = true;
        if (invalid)
            for (var i = 0; i < results.Length; i++) results[i] = results[i] with { Proposal = results[i].Proposal with {
                Blocks = originals.Where(x => x.State == ScheduleState.Planned && x.DailyPlanId == input.Days[i].CurrentPlanId).Select(x => UndoView(x).Block()).ToImmutableArray(),
                Warnings = results[i].Proposal.Warnings.Add(new("UndoCrossDayConstraint")), Explanations = [] } };
        return new(input.Days[0].Snapshot.PlanningVersion, now, "undo-multi-v1", results.ToImmutableArray(), [], false);
    }
}
