using System.Collections.Immutable;
using System.Text.Json;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Tasks;
using static Adhd.UnitTests.SchedulingEngineTests;

namespace Adhd.UnitTests;

public sealed class SchedulingAdvancedTests
{
    private static SchedulingSnapshot Advanced(IEnumerable<SchedulingTask> tasks, double hours = 4, int minimum = 900, int transition = 0) => Snapshot(tasks, hours) with { Policy = new(minimum, transition) };
    private static decimal WorkSeconds(SchedulingProposal proposal, Guid id) => proposal.Blocks.Where(x => x.TaskId == id && x.Kind == ScheduleKind.Work).Sum(x => (x.EndsAt - x.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond);
    [Fact]
    public void SplitSixtyMinutesUsesTwoThirtyGapsWhileNonSplitDoesNot()
    {
        var task = Work(1, 60); var held = Work(2, 30); var snapshot = Advanced([task, held], 1.5) with { ExistingBlocks = [Block(1, held.Id, 30, 60)] };
        var result = Run(snapshot, task.Id); Assert.Equal(2, result.Blocks.Count(x => x.TaskId == task.Id)); Assert.Equal(3600m, WorkSeconds(result, task.Id)); Assert.Empty(result.Unplaced); Assert.Equal("heuristic-v2", result.AlgorithmVersion);
        result = Run(snapshot with { Tasks = [task with { CanSplit = false }, held] }, task.Id); Assert.Equal(0m, WorkSeconds(result, task.Id)); Assert.Equal(UnplacedReason.NoContiguousSlot, Assert.Single(result.Unplaced).Reason);
    }
    [Fact]
    public void PartialCapacityKeepsMissingThirtyMinutesVisibleAndDoesNotReleaseDependent()
    {
        var before = Work(1, 90); var after = Work(2, 10); var snapshot = Advanced([before, after], 1) with { Dependencies = [new(before.Id, after.Id)] };
        var result = Run(snapshot); Assert.Equal(3600m, WorkSeconds(result, before.Id)); Assert.Contains(result.Unplaced, x => x.TaskId == before.Id && x.RemainingSeconds == 1800m && x.Reason == UnplacedReason.InsufficientCapacity);
        Assert.Contains(result.Unplaced, x => x.TaskId == after.Id && x.Reason == UnplacedReason.DependencyBlocked); Assert.Equal(0m, WorkSeconds(result, after.Id));
    }
    [Fact]
    public void FinalSmallPieceIsAllowedButEarlySmallFragmentIsSkipped()
    {
        var task = Work(1, 40); var held = Work(2, 20); var snapshot = Advanced([task, held], 1) with { ExistingBlocks = [Block(1, held.Id, 30, 50)] };
        var result = Run(snapshot, task.Id); Assert.Equal(2400m, WorkSeconds(result, task.Id)); Assert.Equal(TimeSpan.FromMinutes(10), result.Blocks.Last().EndsAt - result.Blocks.Last().StartsAt);
        snapshot = Advanced([task], 1) with { WorkingWindows = [new(Morning, Morning.AddMinutes(10)), new(Morning.AddMinutes(20), Morning.AddMinutes(60))] };
        result = Run(snapshot); Assert.Equal(Morning.AddMinutes(20), Assert.Single(result.Blocks).StartsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void AllGapsBelowMinimumReturnExplicitMinimumConstraint()
    {
        var task = Work(1, 30); var result = Run(Advanced([task], 1) with { WorkingWindows = [new(Morning, Morning.AddMinutes(10)), new(Morning.AddMinutes(20), Morning.AddMinutes(30)), new(Morning.AddMinutes(40), Morning.AddMinutes(50))] });
        Assert.Empty(result.Blocks); Assert.Equal(UnplacedReason.MinimumSplitConstraint, Assert.Single(result.Unplaced).Reason); Assert.Equal(1800m, result.Unplaced[0].RemainingSeconds);
    }
    [Fact]
    public void SuitableExistingIdAndTimeStayAndNewWorkFitsAroundOtherSoftReservations()
    {
        var old = Work(1, 60) with { Priority = TaskPriority.Low }; var added = Work(2, 60) with { Priority = TaskPriority.Urgent }; var original = Block(1, old.Id, 0, 60, fixedBlock: false);
        var result = Run(Advanced([old, added], 2) with { ExistingBlocks = [original] });
        var kept = Assert.Single(result.Blocks, x => x.TaskId == old.Id); Assert.Equal(original.ExistingScheduleId, kept.ExistingScheduleId); Assert.Equal(original.StartsAt, kept.StartsAt); Assert.Equal(original.EndsAt, kept.EndsAt);
        Assert.Equal(Morning.AddHours(1), Assert.Single(result.Blocks, x => x.TaskId == added.Id).StartsAt); Assert.Contains(result.Explanations, x => x.TaskId == old.Id && x.Code == "ExistingPlacementKept");
    }
    [Fact]
    public void DeadlineWinsOverSoftExistingPlacementWithoutLosingEitherTask()
    {
        var old = Work(1, 60) with { Priority = TaskPriority.Low }; var urgent = Work(2, 30) with { DeadlineAt = Morning.AddMinutes(30) }; var original = Block(1, old.Id, 0, 60, fixedBlock: false);
        var result = Run(Advanced([old, urgent], 2) with { ExistingBlocks = [original] }); Assert.Empty(result.Unplaced);
        Assert.Equal(Morning, Assert.Single(result.Blocks, x => x.TaskId == urgent.Id).StartsAt); Assert.Equal(Morning.AddMinutes(30), Assert.Single(result.Blocks, x => x.TaskId == old.Id).StartsAt);
    }
    [Fact]
    public void OldDurationShrinksToRemainingAndNeverAllocatesTargetTwice()
    {
        var task = Work(1, 60) with { ActualSeconds = 1200 }; var original = Block(1, task.Id, 60, 120, fixedBlock: false);
        var result = Run(Advanced([task]) with { ExistingBlocks = [original] }); var kept = Assert.Single(result.Blocks); Assert.Equal(original.ExistingScheduleId, kept.ExistingScheduleId);
        Assert.Equal(TimeSpan.FromMinutes(40), kept.EndsAt - kept.StartsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void TransitionHasVisibleBufferAndReducesWorkCapacityWithoutCountingAsWork()
    {
        var a = Work(1, 30); var b = Work(2, 30); var result = Run(Advanced([a, b], 1, transition: 600));
        Assert.Equal(1800m, WorkSeconds(result, a.Id)); Assert.Equal(1200m, WorkSeconds(result, b.Id));
        var buffer = Assert.Single(result.Blocks, x => x.Kind == ScheduleKind.Buffer); Assert.Null(buffer.TaskId); Assert.Equal(TimeSpan.FromMinutes(10), buffer.EndsAt - buffer.StartsAt); Assert.True(buffer.IsAutomatic);
        Assert.Equal(600m, Assert.Single(result.Unplaced).RemainingSeconds);
    }
    [Fact]
    public void BreakAlreadyOccupiesTransitionAndNoDuplicateBufferIsCreated()
    {
        var a = Work(1, 30); var b = Work(2, 30); var pause = Block(1, null, 30, 40, kind: ScheduleKind.Break);
        var result = Run(Advanced([a, b], 70d / 60, transition: 600) with { ExistingBlocks = [pause] }); Assert.Empty(result.Unplaced);
        Assert.Equal(3600m, WorkSeconds(result, a.Id) + WorkSeconds(result, b.Id)); Assert.DoesNotContain(result.Blocks, x => x.Kind == ScheduleKind.Buffer);
    }
    [Fact]
    public void PartialBreakUsesOnlyUncoveredTransitionBufferAndNoBufferAfterLastWork()
    {
        var a = Work(1, 30); var b = Work(2, 30); var pause = Block(1, null, 30, 35, kind: ScheduleKind.Break);
        var result = Run(Advanced([a, b], 70d / 60, transition: 600) with { ExistingBlocks = [pause] });
        var buffer = Assert.Single(result.Blocks, x => x.Kind == ScheduleKind.Buffer); Assert.Equal(Morning.AddMinutes(35), buffer.StartsAt); Assert.Equal(Morning.AddMinutes(40), buffer.EndsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void FixedSuccessorReservesTransitionBeforeItsStartAndKeepsItsIdentity()
    {
        var a = Work(1, 30); var b = Work(2, 30); var original = Block(1, b.Id, 40, 70);
        var result = Run(Advanced([a, b], 2, transition: 600) with { Dependencies = [new(a.Id, b.Id)], ExistingBlocks = [original] }, a.Id);
        Assert.Equal(Morning.AddMinutes(30), Assert.Single(result.Blocks, x => x.TaskId == a.Id).EndsAt); Assert.Contains(original with { IsPreserved = true }, result.Blocks);
        Assert.Equal(TimeSpan.FromMinutes(10), Assert.Single(result.Blocks, x => x.Kind == ScheduleKind.Buffer).EndsAt - result.Blocks.Single(x => x.Kind == ScheduleKind.Buffer).StartsAt); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void RecomputedAutomaticBufferDoesNotLeaveStaleFutureCapacityReservation()
    {
        var task = Work(1, 60); var obsolete = Block(1, null, 30, 60, fixedBlock: false, kind: ScheduleKind.Buffer) with { IsAutomatic = true };
        var result = Run(Advanced([task], 1) with { ExistingBlocks = [obsolete] }); Assert.Empty(result.Unplaced); Assert.Equal(3600m, WorkSeconds(result, task.Id)); Assert.DoesNotContain(result.Blocks, x => x.ExistingScheduleId == obsolete.ExistingScheduleId);
        result = Run(Advanced([task], 1) with { ExistingBlocks = [obsolete with { IsAutomatic = false }] }); Assert.Contains(result.Blocks, x => x.ExistingScheduleId == obsolete.ExistingScheduleId); Assert.Equal(1800m, Assert.Single(result.Unplaced).RemainingSeconds);
    }
    [Fact]
    public void NeverCreatesBufferOutsideWorkingHoursOrAcrossNonWorkingLunch()
    {
        var a = Work(1, 30); var b = Work(2, 30); var result = Run(Advanced([a, b], 2, transition: 600) with { WorkingWindows = [new(Morning, Morning.AddMinutes(30)), new(Morning.AddHours(1), Morning.AddMinutes(90))] });
        Assert.Empty(result.Unplaced); Assert.DoesNotContain(result.Blocks, x => x.Kind == ScheduleKind.Buffer);
    }
    [Fact]
    public void SplitDependencyIsReleasedOnlyAfterItsLastPiece()
    {
        var a = Work(1, 60); var b = Work(2, 10) with { Priority = TaskPriority.Urgent }; var held = Work(3, 30);
        var result = Run(Advanced([a, b, held], 2) with { ExistingBlocks = [Block(1, held.Id, 30, 60)], Dependencies = [new(a.Id, b.Id)] }, a.Id, b.Id);
        Assert.Equal(Morning.AddMinutes(90), Assert.Single(result.Blocks, x => x.TaskId == b.Id).StartsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void SplitShortageBeforeDeadlineHasDeadlineReasonAndExactRemaining()
    {
        var task = Work(1, 90) with { DeadlineAt = Morning.AddHours(1) }; var result = Run(Advanced([task], 2));
        Assert.Equal(3600m, WorkSeconds(result, task.Id)); var missing = Assert.Single(result.Unplaced); Assert.Equal(1800m, missing.RemainingSeconds); Assert.Equal(UnplacedReason.DeadlineRisk, missing.Reason);
    }
    [Fact]
    public void RandomizedInputsConserveKnownWorkAndPreserveHardBlocksWithoutMutatingSnapshot()
    {
        for (var seed = 1; seed <= 30; seed++)
        {
            var random = new Random(seed); var a = Work(1, random.Next(20, 160)); var b = Work(2, random.Next(10, 80)); var fixedTask = Work(3, 30);
            var snapshot = Advanced([a, b, fixedTask], 3, transition: random.Next(0, 6) * 60) with { ExistingBlocks = [Block(1, fixedTask.Id, 45, 75)] }; var original = JsonSerializer.Serialize(snapshot); var result = Run(snapshot, a.Id, b.Id);
            Assert.Equal(original, JsonSerializer.Serialize(snapshot)); Assert.Equal(JsonSerializer.Serialize(result), JsonSerializer.Serialize(Run(snapshot with { Tasks = snapshot.Tasks.Reverse().ToImmutableArray() }, b.Id, a.Id)));
            foreach (var task in new[] { a, b }) Assert.Equal((decimal)task.EstimatedSeconds!.Value, WorkSeconds(result, task.Id) + result.Unplaced.Where(x => x.TaskId == task.Id).Sum(x => x.RemainingSeconds ?? 0));
            foreach (var block in result.Blocks.Where(x => !x.IsPreserved)) Assert.DoesNotContain(result.Blocks, x => !ReferenceEquals(x, block) && PlanTime.Overlaps(block.StartsAt, block.EndsAt, x.StartsAt, x.EndsAt));
            Assert.Contains(snapshot.ExistingBlocks[0] with { IsPreserved = true }, result.Blocks);
        }
    }
    [Fact]
    public void NonSplitWithSixtyCapacityLeavesNinetyEntirelyUnplaced()
    {
        var task = Work(1, 90) with { CanSplit = false }; var result = Run(Advanced([task], 1)); Assert.Empty(result.Blocks); Assert.Equal(5400m, Assert.Single(result.Unplaced).RemainingSeconds);
    }
    [Fact]
    public void AdjacentExistingPiecesOfSameTaskNeedNoTransitionBetweenThem()
    {
        var task = Work(1, 60); var a = Block(1, task.Id, 0, 30, fixedBlock: false); var b = Block(2, task.Id, 30, 60, fixedBlock: false);
        var result = Run(Advanced([task], 1, transition: 600) with { ExistingBlocks = [a, b] }); Assert.Empty(result.Unplaced); Assert.Equal(2, result.Blocks.Length);
        Assert.Equal(new[] { a.ExistingScheduleId, b.ExistingScheduleId }, result.Blocks.Select(x => x.ExistingScheduleId)); Assert.DoesNotContain(result.Blocks, x => x.Kind == ScheduleKind.Buffer);
    }
    [Fact]
    public void ExistingDependentSlotCannotBypassNewPrerequisiteForecast()
    {
        var before = Work(1, 30); var after = Work(2, 30); var original = Block(1, after.Id, 0, 30, fixedBlock: false);
        var result = Run(Advanced([before, after], 1) with { Dependencies = [new(before.Id, after.Id)], ExistingBlocks = [original] });
        Assert.Equal(Morning.AddMinutes(30), Assert.Single(result.Blocks, x => x.TaskId == after.Id).StartsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void OutsideAndActualStillLimitAdvancedPlacementAndLastMicrosecondIsPreserved()
    {
        var task = Work(1, 60) with { ActualSeconds = 1200.000001m, OutsideReservedSeconds = 1200, OutsideCompletionAt = Morning.AddDays(1) };
        var result = Run(Advanced([task], 1)); Assert.Equal(1199.999999m, WorkSeconds(result, task.Id)); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void KnownActiveWorkWithShortPlanRequestsPlanExtensionInsteadOfInventingExtraEstimate()
    {
        var task = Work(1, 60) with { State = TaskState.InProgress }; var held = Block(1, task.Id, 0, 30, fixedBlock: false) with { IsActive = true };
        var result = Run(Advanced([task], 2) with { ExistingBlocks = [held] }); Assert.True(result.HasConstraintConflicts);
        Assert.Equal(UnplacedReason.ActiveReservationTooShort, Assert.Single(result.Unplaced).Reason); Assert.Equal(1800m, result.Unplaced[0].RemainingSeconds);
    }
    [Fact]
    public void InvalidMinimumOrTransitionPolicyIsRejected()
    {
        var snapshot = Advanced([Work(1)]); Assert.Throws<ArgumentException>(() => Run(snapshot with { Policy = new(0) })); Assert.Throws<ArgumentException>(() => Run(snapshot with { Policy = new(900, -1) }));
    }
}

