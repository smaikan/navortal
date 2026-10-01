using System.Collections.Immutable;
using System.Text.Json;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class SchedulingEngineTests
{
    internal static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal static Guid Id(int number) => new(number, 0, 0, new byte[8]);
    internal static SchedulingTask Work(int number, long? minutes = 30) => new(Id(number), EstimatedSeconds: minutes * 60);
    internal static SchedulingSnapshot Snapshot(IEnumerable<SchedulingTask> tasks, double hours = 4) => new(new(2026, 10, 15), "Europe/Istanbul", Morning, 27,
        tasks.ToImmutableArray(), [], [], [new(Morning, Morning.AddHours(hours))], []);
    internal static SchedulingProposal Run(SchedulingSnapshot snapshot, params Guid[] selected) => new SchedulingEngine().Generate(snapshot,
        new(selected.Length == 0 ? snapshot.Tasks.Select(x => x.Id).ToImmutableArray() : selected.ToImmutableArray()));
    internal static SchedulingBlock Block(int number, Guid? task, double startMinute, double endMinute, bool fixedBlock = true, ScheduleKind kind = ScheduleKind.Work) =>
        new(Id(1000 + number), task, kind, Morning.AddMinutes(startMinute), Morning.AddMinutes(endMinute), IsFixed: fixedBlock);
    internal static SchedulingBlock NewBlock(SchedulingProposal proposal, Guid task) => Assert.Single(proposal.Blocks, x => x.TaskId == task && !x.IsPreserved);

    [Fact]
    public void DeterministicUnderInputPermutationAndDoesNotMutateInput()
    {
        var snapshot = Snapshot([Work(3), Work(1), Work(2)]) with { Ordering = [new(Id(1), Id(2))] };
        var original = JsonSerializer.Serialize(snapshot); var result = Run(snapshot);
        var reverse = snapshot with { Tasks = snapshot.Tasks.Reverse().ToImmutableArray(), WorkingWindows = snapshot.WorkingWindows.Reverse().ToImmutableArray() };
        Assert.Equal(JsonSerializer.Serialize(result), JsonSerializer.Serialize(Run(reverse, Id(2), Id(1), Id(3)))); Assert.Equal(original, JsonSerializer.Serialize(snapshot));
        Assert.Equal(27, result.InputPlanningVersion); Assert.Equal(Morning, result.AnchorAt); Assert.Equal("heuristic-v1", result.AlgorithmVersion);
        Assert.Equal(new[] { Id(1), Id(2), Id(3) }, result.Blocks.Select(x => x.TaskId!.Value)); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void ContainerAndParentOwnWorkArePhysicalComponentsExactlyOnce()
    {
        var root = new SchedulingTask(Id(1), HasDirectWork: false); var child = Work(2, 20) with { ParentTaskId = root.Id }; var parentOwn = Work(3, 15) with { ParentTaskId = root.Id }; var grandchild = Work(4, 25) with { ParentTaskId = parentOwn.Id };
        var result = Run(Snapshot([root, child, parentOwn, grandchild]), root.Id);
        Assert.Equal(3, result.Blocks.Length); Assert.Equal(3600, result.Blocks.Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds)); Assert.DoesNotContain(result.Blocks, x => x.TaskId == root.Id);
    }
    [Fact]
    public void FixedLockedAndExistingBreakRemainWhileNonSplitCannotUseTwoThirtyMinuteGaps()
    {
        var fixedTask = Work(2, 30); var target = Work(1, 60); var locked = Block(1, fixedTask.Id, 30, 60) with { IsFixed = false, IsLocked = true };
        var snapshot = Snapshot([target, fixedTask], 1.5) with { ExistingBlocks = [locked] }; var result = Run(snapshot, target.Id);
        Assert.Equal(locked with { IsPreserved = true }, Assert.Single(result.Blocks)); var missing = Assert.Single(result.Unplaced);
        Assert.Equal(UnplacedReason.NoContiguousSlot, missing.Reason); Assert.Equal(3600m, missing.RemainingSeconds);
        Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void ExistingBreakAndOverlappingWorkingWindowsConsumeUnionCapacity()
    {
        var work = Work(1, 30); var pause = Block(1, null, 0, 30, kind: ScheduleKind.Break);
        var result = Run(Snapshot([work], 1) with { WorkingWindows = [new(Morning, Morning.AddHours(1)), new(Morning.AddMinutes(15), Morning.AddMinutes(45))], ExistingBlocks = [pause] });
        Assert.Equal(Morning.AddMinutes(30), NewBlock(result, work.Id).StartsAt); Assert.Equal(2, result.Blocks.Length);
        Assert.Equal(ScheduleKind.Break, result.Blocks[0].Kind);
    }
    [Theory] [InlineData(TaskState.Canceled)] [InlineData(TaskState.Skipped)] [InlineData(TaskState.Deferred)]
    public void InactivePredecessorDoesNotReleaseActualOrProjectedSuccessor(TaskState state)
    {
        var before = Work(1) with { State = state }; var after = Work(2);
        var result = Run(Snapshot([before, after]) with { Dependencies = [new(before.Id, after.Id)] }, after.Id);
        Assert.Empty(result.Blocks); Assert.Equal(UnplacedReason.DependencyBlocked, Assert.Single(result.Unplaced).Reason);
    }
    [Fact]
    public void MultipleAndInheritedPrerequisitesUseProjectedEndsWithoutCompletingTasks()
    {
        var a = Work(1, 30); var b = Work(2, 20); var parent = new SchedulingTask(Id(3), HasDirectWork: false); var child = Work(4, 10) with { ParentTaskId = parent.Id, Priority = TaskPriority.Urgent };
        var snapshot = Snapshot([a, b, parent, child]) with { Dependencies = [new(a.Id, parent.Id), new(b.Id, parent.Id)] }; var result = Run(snapshot);
        var start = NewBlock(result, child.Id).StartsAt; Assert.True(start >= NewBlock(result, a.Id).EndsAt); Assert.True(start >= NewBlock(result, b.Id).EndsAt);
        Assert.Equal(TaskState.Pending, a.State); Assert.Equal(TaskState.Pending, b.State);
    }
    [Fact]
    public void RequiredChildCompletionPrecedesParentDependentWhileOptionalChildDoesNot()
    {
        var parent = new SchedulingTask(Id(1), HasDirectWork: false); var required = Work(2, 30) with { ParentTaskId = parent.Id };
        var optional = Work(3, 30) with { ParentTaskId = parent.Id, RequiredForParent = false, Priority = TaskPriority.Low };
        var dependent = Work(4, 30) with { Priority = TaskPriority.Urgent };
        var result = Run(Snapshot([parent, required, optional, dependent]) with { Dependencies = [new(parent.Id, dependent.Id)] });
        Assert.Equal(NewBlock(result, required.Id).EndsAt, NewBlock(result, dependent.Id).StartsAt);
        Assert.True(NewBlock(result, optional.Id).StartsAt >= NewBlock(result, dependent.Id).EndsAt);
    }
    [Fact]
    public void ParentOwnWorkAndChildrenMustBothFinishBeforeDependent()
    {
        var parent = Work(1, 20); var child = Work(2, 20) with { ParentTaskId = parent.Id }; var successor = Work(3, 20) with { Priority = TaskPriority.Urgent };
        var result = Run(Snapshot([parent, child, successor]) with { Dependencies = [new(parent.Id, successor.Id)] });
        Assert.True(NewBlock(result, successor.Id).StartsAt >= NewBlock(result, child.Id).EndsAt); Assert.True(NewBlock(result, successor.Id).StartsAt >= NewBlock(result, parent.Id).EndsAt);
    }
    [Fact]
    public void ManualCompletedParentDoesNotConstrainOpenChildToItsDependentsFixedStart()
    {
        var parent = new SchedulingTask(Id(1), HasDirectWork: false, State: TaskState.Completed); var child = Work(2, 60) with { ParentTaskId = parent.Id }; var successor = Work(3, 30);
        var result = Run(Snapshot([parent, child, successor]) with { Dependencies = [new(parent.Id, successor.Id)], ExistingBlocks = [Block(1, successor.Id, 0, 30)] }, child.Id);
        Assert.Equal(Morning.AddMinutes(30), NewBlock(result, child.Id).StartsAt); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void FixedSuccessorPropagatesCompletionDeadlineToItsUnplacedPrerequisite()
    {
        var before = Work(1, 30); var fixedSuccessor = Work(2, 30); var unrelated = Work(3, 60) with { Priority = TaskPriority.Urgent };
        var result = Run(Snapshot([before, fixedSuccessor, unrelated]) with { Dependencies = [new(before.Id, fixedSuccessor.Id)], ExistingBlocks = [Block(1, fixedSuccessor.Id, 30, 60)] }, before.Id, unrelated.Id);
        Assert.Equal(Morning, NewBlock(result, before.Id).StartsAt); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void UnknownAndExhaustedTasksRemainVisibleAndBlockTheirDependents()
    {
        var unknown = Work(1, null); var exhausted = Work(2, 20) with { ActualSeconds = 1200 }; var after = Work(3);
        var result = Run(Snapshot([unknown, exhausted, after]) with { Dependencies = [new(unknown.Id, after.Id)] });
        Assert.Contains(result.Unplaced, x => x.TaskId == unknown.Id && x.Reason == UnplacedReason.NoEstimate && x.RemainingSeconds == null);
        Assert.Contains(result.Unplaced, x => x.TaskId == exhausted.Id && x.Reason == UnplacedReason.NeedsEstimateExtension && x.RemainingSeconds == 0);
        Assert.Contains(result.Unplaced, x => x.TaskId == after.Id && x.Reason == UnplacedReason.DependencyBlocked); Assert.Empty(result.Blocks);
    }
    [Fact]
    public void ActualOutsideAndProtectedAllocationsAreDeductedBeforeNewPlacement()
    {
        var task = Work(1, 120) with { ActualSeconds = 1200, OutsideReservedSeconds = 1800, OutsideCompletionAt = Morning.AddDays(1) };
        var held = Block(1, task.Id, 0, 30); var result = Run(Snapshot([task]) with { ExistingBlocks = [held] });
        var added = NewBlock(result, task.Id); Assert.Equal(TimeSpan.FromMinutes(40), added.EndsAt - added.StartsAt);
        Assert.Equal(4200, result.Blocks.Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds));
    }
    [Fact]
    public void FullyReservedElsewhereDoesNotScheduleAgainOrReleaseSuccessorToday()
    {
        var before = Work(1) with { OutsideReservedSeconds = 1800, OutsideCompletionAt = Morning.AddDays(1) }; var after = Work(2);
        var result = Run(Snapshot([before, after]) with { Dependencies = [new(before.Id, after.Id)] });
        Assert.Empty(result.Blocks); Assert.Contains(result.Explanations, x => x.TaskId == before.Id && x.Code == "AlreadyReserved"); Assert.Equal(after.Id, Assert.Single(result.Unplaced).TaskId);
    }
    [Fact]
    public void DeadlineCriticalPriorityAndStableIdChooseReadyOrder()
    {
        var urgent = Work(1) with { Priority = TaskPriority.Urgent }; var critical = Work(2) with { IsCritical = true }; var deadline = Work(3) with { DeadlineAt = Morning.AddMinutes(30) };
        var result = Run(Snapshot([urgent, critical, deadline])); Assert.Equal(new[] { deadline.Id, critical.Id, urgent.Id }, result.Blocks.Select(x => x.TaskId!.Value));
    }
    [Fact]
    public void MissedDeadlineDoesNotCreateLateBlockOrClaimMathematicalImpossibility()
    {
        var task = Work(1, 60) with { DeadlineAt = Morning.AddMinutes(30) }; var result = Run(Snapshot([task]));
        Assert.Empty(result.Blocks); Assert.Equal(UnplacedReason.DeadlineRisk, Assert.Single(result.Unplaced).Reason); Assert.Equal(3600m, result.Unplaced[0].RemainingSeconds);
    }
    [Fact]
    public void SoftOrderingCanFallBackBeforeDeadlineAndCycleIsNotHardFailure()
    {
        var a = Work(1) with { DeadlineAt = Morning.AddMinutes(30) }; var b = Work(2); var snapshot = Snapshot([a, b]) with { Ordering = [new(b.Id, a.Id), new(a.Id, b.Id)] };
        var result = Run(snapshot); Assert.Equal(Morning, NewBlock(result, a.Id).StartsAt); Assert.Contains(result.Warnings, x => x.Code == "OrderingPreferenceUnmet"); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void PastAndActiveRealityStayAndUnknownActiveEndBlocksUnsafeAutomaticFuture()
    {
        var active = Work(1, 20) with { ActualSeconds = 1200, State = TaskState.InProgress }; var other = Work(2);
        var old = Block(1, active.Id, -30, 0, fixedBlock: false) with { IsActive = true };
        var result = Run(Snapshot([active, other]) with { ExistingBlocks = [old], ServerNow = Morning.AddMinutes(10) });
        Assert.Equal(old with { IsPreserved = true }, Assert.Single(result.Blocks)); Assert.True(result.HasConstraintConflicts); Assert.Contains(result.Warnings, x => x.Code == "ActiveEndUnknown");
        Assert.DoesNotContain(result.Blocks, x => !x.IsPreserved);
    }
    [Fact]
    public void ActiveKnownReservationIsNotCutOrAllocatedAgain()
    {
        var active = Work(1, 60) with { ActualSeconds = 1200, State = TaskState.InProgress }; var other = Work(2, 20);
        var original = Block(1, active.Id, 0, 60, fixedBlock: false) with { IsActive = true };
        var result = Run(Snapshot([active, other]) with { ExistingBlocks = [original], ServerNow = Morning.AddMinutes(20) });
        Assert.Equal(original with { IsPreserved = true }, Assert.Single(result.Blocks, x => x.TaskId == active.Id)); Assert.Equal(Morning.AddHours(1), NewBlock(result, other.Id).StartsAt); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void FixedOverlapIsExplicitAndNewBlocksUseUnionOfOccupiedIntervals()
    {
        var a = Work(1, 60); var b = Work(2, 60); var c = Work(3, 30);
        var result = Run(Snapshot([a, b, c], 2) with { ExistingBlocks = [Block(1, a.Id, 0, 60), Block(2, b.Id, 30, 90)] }, c.Id);
        Assert.Equal(Morning.AddMinutes(90), NewBlock(result, c.Id).StartsAt); Assert.True(result.HasConstraintConflicts); Assert.Contains(result.Warnings, x => x.Code == "ProtectedConflict");
    }
    [Fact]
    public void EmptyCalendarDoesNotAssumeNineToFiveAndPastDayCannotGainNewWork()
    {
        var task = Work(1); var result = Run(Snapshot([task]) with { WorkingWindows = [] }); Assert.Empty(result.Blocks); Assert.Equal(UnplacedReason.NoWorkingHours, Assert.Single(result.Unplaced).Reason);
        result = Run(Snapshot([task]) with { ServerNow = Morning.AddDays(1) }); Assert.Empty(result.Blocks); Assert.Equal(UnplacedReason.NoWorkingHours, Assert.Single(result.Unplaced).Reason);
    }
    [Fact]
    public void UnselectedFutureBlockIsKeptAndSelectedOldFlexibleFutureIsReplaced()
    {
        var a = Work(1); var b = Work(2); var held = Block(1, a.Id, 30, 60, fixedBlock: false); var old = Block(2, b.Id, 60, 90, fixedBlock: false);
        var result = Run(Snapshot([a, b]) with { ExistingBlocks = [held, old] }, b.Id);
        Assert.Contains(held with { IsPreserved = true }, result.Blocks); Assert.DoesNotContain(result.Blocks, x => x.ExistingScheduleId == old.ExistingScheduleId); Assert.Equal(Morning, NewBlock(result, b.Id).StartsAt);
    }
    [Fact]
    public void InvalidGraphIncludingArchivedParentCycleIsRejected()
    {
        var a = Work(1); var b = Work(2); var snapshot = Snapshot([a, b]) with { Dependencies = [new(a.Id, b.Id), new(b.Id, a.Id)] };
        Assert.Throws<ArgumentException>(() => Run(snapshot));
        Assert.Throws<ArgumentException>(() => Run(Snapshot([a with { ParentTaskId = b.Id, IsArchived = true }, b with { ParentTaskId = a.Id, IsArchived = true }])));
        Assert.Throws<ArgumentException>(() => Run(Snapshot([a, a])));
    }
    [Fact]
    public void FractionalSecondsAndVeryLargeEstimatesNeverOverflowOrLoseRemainingWork()
    {
        var micro = Work(1, 1) with { ActualSeconds = .000001m }; var huge = Work(2) with { EstimatedSeconds = long.MaxValue };
        var result = Run(Snapshot([micro, huge], 1)); var added = NewBlock(result, micro.Id);
        Assert.Equal(599999990, (added.EndsAt - added.StartsAt).Ticks); Assert.Equal((decimal)long.MaxValue, Assert.Single(result.Unplaced).RemainingSeconds);
    }
    [Fact]
    public void DeepTreeUsesIterativeGraphAndOnlyLeafDuration()
    {
        var tasks = Enumerable.Range(1, 5000).Select(i => new SchedulingTask(Id(i), i == 1 ? null : Id(i - 1), HasDirectWork: i == 5000, EstimatedSeconds: i == 5000 ? 60 : null)).ToArray();
        var result = Run(Snapshot(tasks), Id(1)); Assert.Equal(Id(5000), Assert.Single(result.Blocks).TaskId); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void PartialOutsideReservationWithoutForecastCannotReleaseDependent()
    {
        var before = Work(1, 60) with { OutsideReservedSeconds = 1800 }; var after = Work(2);
        var result = Run(Snapshot([before, after]) with { Dependencies = [new(before.Id, after.Id)] });
        Assert.Equal(TimeSpan.FromMinutes(30), NewBlock(result, before.Id).EndsAt - NewBlock(result, before.Id).StartsAt);
        Assert.Equal(after.Id, Assert.Single(result.Unplaced).TaskId); Assert.Contains(result.Warnings, x => x.Code == "OutsideCompletionUnknown");
    }
    [Fact]
    public void ContainerDeadlineConstrainsRequiredChildButNotOptionalChild()
    {
        var root = new SchedulingTask(Id(1), HasDirectWork: false, DeadlineAt: Morning.AddMinutes(30)); var required = Work(2) with { ParentTaskId = root.Id };
        var optional = Work(3) with { ParentTaskId = root.Id, RequiredForParent = false, Priority = TaskPriority.Urgent };
        var result = Run(Snapshot([root, required, optional]), root.Id);
        Assert.Equal(Morning, NewBlock(result, required.Id).StartsAt); Assert.Equal(Morning.AddMinutes(30), NewBlock(result, optional.Id).StartsAt); Assert.Empty(result.Unplaced);
    }
}
