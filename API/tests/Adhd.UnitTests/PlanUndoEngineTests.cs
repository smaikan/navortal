using System.Collections.Immutable;
using System.Text.Json;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Tasks;
using static Adhd.UnitTests.SchedulingEngineTests;

namespace Adhd.UnitTests;

public sealed class PlanUndoEngineTests
{
    private static UndoSchedule Row(int id, Guid? task, int start, int end, long version = 1, ScheduleState state = ScheduleState.Planned) =>
        new(Id(100 + id), task, task.HasValue ? ScheduleKind.Work : ScheduleKind.Break, state, Morning.AddMinutes(start), Morning.AddMinutes(end), false, false, false, version);
    private static PlanUndoSnapshot Input(SchedulingTask[] tasks, UndoSchedule[] rows, params UndoDelta[] changes) =>
        new(Snapshot(tasks, 4) with { Policy = new(), ExistingBlocks = rows.Where(x => x.State == ScheduleState.Planned).Select(x => x.Block()).ToImmutableArray() }, new([]), rows.ToImmutableArray(), changes.ToImmutableArray(), false);
    private static SchedulingProposal Run(PlanUndoSnapshot input) => new PlanUndoEngine().Generate(input);
    [Fact]
    public void MoveInverseKeepsIdAndDoesNotMutateInput()
    {
        var task = Work(1, 30); var before = Row(1, task.Id, 30, 60); var after = before with { StartsAt = Morning.AddMinutes(90), EndsAt = Morning.AddMinutes(120), Version = 2 };
        var input = Input([task], [after], new UndoDelta(before, after)); var json = JsonSerializer.Serialize(input); var result = Run(input); var block = Assert.Single(result.Blocks);
        Assert.Equal(before.StartsAt, block.StartsAt); Assert.Equal(before.Id, block.ExistingScheduleId); Assert.Empty(result.Warnings); Assert.Equal("undo-v1", result.AlgorithmVersion); Assert.Equal(json, JsonSerializer.Serialize(input)); Assert.Equal(JsonSerializer.Serialize(result), JsonSerializer.Serialize(Run(input)));
    }
    [Fact]
    public void UndoAddedTrimsFutureButKeepsPastPrefix()
    {
        var task = Work(1, 60); var row = Row(1, task.Id, 0, 60); var input = Input([task], [row], new UndoDelta(null, row)); input = input with { Current = input.Current with { ServerNow = Morning.AddMinutes(20) } };
        Assert.Equal(Morning.AddMinutes(20), Assert.Single(Run(input).Blocks).EndsAt);
    }
    [Theory] [InlineData(TaskState.Completed)] [InlineData(TaskState.Canceled)] [InlineData(TaskState.Deferred)]
    public void ClosedTaskIsNeverRestored(TaskState state)
    {
        var task = Work(1, 60) with { State = state }; var before = Row(1, task.Id, 30, 90); var after = before with { State = ScheduleState.Removed, Version = 2 };
        var result = Run(Input([task], [after], new UndoDelta(before, after))); Assert.Empty(result.Blocks); Assert.Contains(result.Warnings, x => x.Code == "UndoTaskInactive" && x.ScheduleId == before.Id);
    }
    [Fact]
    public void ActiveAndChangedSchedulesAreProtected()
    {
        var task = Work(1, 60); var before = Row(1, task.Id, 0, 60); var after = before with { StartsAt = Morning.AddMinutes(60), EndsAt = Morning.AddMinutes(120), Version = 2 };
        var input = Input([task], [after], new UndoDelta(before, after)); input = input with { Current = input.Current with { ExistingBlocks = [after.Block() with { IsActive = true }] } };
        Assert.Contains(Run(input).Warnings, x => x.Code == "UndoActiveWorkProtected");
        input = Input([task], [after with { Version = 3 }], new UndoDelta(before, after)); Assert.Contains(Run(input).Warnings, x => x.Code == "UndoScheduleChanged");
    }
    [Fact]
    public void FixedNeedsExplicitIntentAndRestoredBlockCannotOverlapNewFixed()
    {
        var task = Work(1, 30); var before = Row(1, task.Id, 30, 60); var after = before with { StartsAt = Morning.AddMinutes(90), EndsAt = Morning.AddMinutes(120), Version = 2, IsFixed = true };
        var input = Input([task], [after], new UndoDelta(before, after)); Assert.Contains(Run(input).Warnings, x => x.Code == "UndoProtectedIntentRequired"); Assert.Equal(before.StartsAt, Assert.Single(Run(input with { AllowProtectedChange = true }).Blocks).StartsAt);
        var held = Row(2, null, 30, 60) with { IsFixed = true }; input = Input([task], [after with { IsFixed = false }, held], new UndoDelta(before, after));
        var result = Run(input); Assert.Contains(result.Warnings, x => x.Code == "UndoOverlap"); Assert.Equal(after.StartsAt, Assert.Single(result.Blocks, x => x.TaskId == task.Id).StartsAt);
    }
    [Fact]
    public void ReducedEstimateOrWorkingHoursRejectRestoration()
    {
        var task = Work(1, 60) with { ActualSeconds = 3000 }; var before = Row(1, task.Id, 30, 90); var after = before with { State = ScheduleState.Removed, Version = 2 }; var input = Input([task], [after], new UndoDelta(before, after));
        Assert.Contains(Run(input).Warnings, x => x.Code == "UndoQuantityExceeded");
        input = input with { Current = input.Current with { WorkingWindows = [new(Morning.AddHours(2), Morning.AddHours(3))] } }; Assert.Contains(Run(input).Warnings, x => x.Code == "UndoOutsideWorkingHours");
    }
    [Fact]
    public void RemovingPrerequisiteCannotInvalidateUntouchedSuccessor()
    {
        var first = Work(1, 30); var next = Work(2, 30); var a = Row(1, first.Id, 0, 30); var b = Row(2, next.Id, 30, 60); var input = Input([first, next], [a, b], new UndoDelta(null, a));
        input = input with { Current = input.Current with { Dependencies = [new(first.Id, next.Id)] } }; var result = Run(input);
        Assert.Equal(2, result.Blocks.Length); Assert.Contains(result.Warnings, x => x.Code == "UndoDependencyConflict"); Assert.Empty(result.Explanations);
    }
    [Fact]
    public void MovingPredecessorAfterUntouchedSuccessorIsRejected()
    {
        var first = Work(1, 30); var next = Work(2, 30); var before = Row(1, first.Id, 120, 150); var a = Row(1, first.Id, 0, 30, 2); var b = Row(2, next.Id, 30, 60); var input = Input([first, next], [a, b], new UndoDelta(before, a));
        input = input with { Current = input.Current with { Dependencies = [new(first.Id, next.Id)] } }; var result = Run(input);
        Assert.Equal(a.StartsAt, Assert.Single(result.Blocks, x => x.TaskId == first.Id).StartsAt); Assert.Contains(result.Warnings, x => x.Code == "UndoDependencyConflict");
    }
    [Fact]
    public void RemovedBlockUsesSameIdAndElapsedPartIsExplicit()
    {
        var task = Work(1, 60); var before = Row(1, task.Id, 0, 60); var after = before with { State = ScheduleState.Removed, Version = 2 }; var input = Input([task], [after], new UndoDelta(before, after));
        input = input with { Current = input.Current with { ServerNow = Morning.AddMinutes(20) }, Intent = new([], NewWorkNotBefore: Morning.AddMinutes(21)) };
        var result = Run(input); var block = Assert.Single(result.Blocks); Assert.Equal(before.Id, block.ExistingScheduleId); Assert.Equal(Morning.AddMinutes(21), block.StartsAt); Assert.Contains(result.Warnings, x => x.Code == "UndoElapsedPartNotRestored" && x.Seconds == 1260m);
    }
    [Fact]
    public void TransitionAndNonSplitPreferencesAreRevalidated()
    {
        var a = Work(1, 60); var b = Work(2, 30); var before = Row(1, a.Id, 30, 60); var removed = before with { State = ScheduleState.Removed, Version = 2 }; var held = Row(2, b.Id, 60, 90);
        var input = Input([a, b], [removed, held], new UndoDelta(before, removed)); input = input with { Current = input.Current with { Policy = new(900, 300) } }; Assert.Contains(Run(input).Warnings, x => x.Code == "UndoTransitionConflict");
        var second = Row(3, a.Id, 90, 120); input = Input([a with { CanSplit = false }], [removed, second], new UndoDelta(before, removed)); Assert.Contains(Run(input).Warnings, x => x.Code == "UndoNonSplitConflict");
    }
}
