using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class TaskLifecycleTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 15, 9, 0, 0, TimeSpan.Zero);
    private static TaskItem Node(TaskItem? parent = null, bool direct = true, long? seconds = null) => new()
    { Id = Guid.NewGuid(), ParentTaskId = parent?.Id, HasDirectWork = direct, DirectEstimatedSeconds = seconds };
    [Fact]
    public void RequiredChildrenAndOwnWorkAllNeedCompletionBeforeParentCanCompleteAutomatically()
    {
        var parent = Node(seconds: 600); var one = Node(parent, seconds: 600); var two = Node(parent, seconds: 1200); TaskItem[] nodes = [parent, one, two];
        TaskLifecycle.Apply(nodes, one.Id, TaskAction.Complete, null, Now);
        TaskLifecycle.Apply(nodes, two.Id, TaskAction.Complete, null, Now);
        Assert.Equal(TaskState.Pending, parent.State);
        TaskLifecycle.Apply(nodes, parent.Id, TaskAction.CompleteDirectWork, null, Now);
        Assert.Equal(TaskState.Completed, parent.State); Assert.Equal(CompletionOrigin.Automatic, parent.CompletionOrigin); Assert.Equal(Now, parent.CompletedAt);
    }
    [Fact]
    public void ReopenedChildReopensAutomaticAncestorsButPreservesManualAncestorDecision()
    {
        var root = Node(direct: false); var parent = Node(root, false); var child = Node(parent); TaskItem[] nodes = [root, parent, child];
        TaskLifecycle.Apply(nodes, child.Id, TaskAction.Complete, null, Now);
        Assert.Equal(CompletionOrigin.Automatic, root.CompletionOrigin); Assert.Equal(CompletionOrigin.Automatic, parent.CompletionOrigin);
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.Complete, ParentCompletionChoice.ParentOnly, Now);
        TaskLifecycle.Apply(nodes, child.Id, TaskAction.Reopen, null, Now.AddMinutes(1));
        Assert.Equal(TaskState.Pending, parent.State); Assert.Null(parent.CompletedAt);
        Assert.Equal(TaskState.Completed, root.State); Assert.Equal(CompletionOrigin.Manual, root.CompletionOrigin);
        Assert.True(TaskProgressCalculator.Calculate(nodes, root.Id).HasOpenDescendants);
    }
    [Fact]
    public void ParentOnlySubtreeAndCancelChoicesHaveDistinctOutcomes()
    {
        var root = Node(direct: false); var child = Node(root); TaskItem[] nodes = [root, child];
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.Complete, ParentCompletionChoice.Cancel, Now); Assert.Equal(TaskState.Pending, root.State);
        Assert.Throws<ArgumentException>(() => TaskLifecycle.Apply(nodes, root.Id, TaskAction.Complete, null, Now));
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.Complete, ParentCompletionChoice.ParentOnly, Now);
        Assert.Equal(TaskState.Pending, child.State); Assert.Equal(TaskState.Completed, root.State);
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.Complete, ParentCompletionChoice.CompleteSubtree, Now);
        Assert.Equal(TaskState.Completed, child.State); Assert.True(child.DirectWorkCompleted);
    }
    [Theory]
    [InlineData(TaskAction.Skip, TaskState.Skipped)]
    [InlineData(TaskAction.Cancel, TaskState.Canceled)]
    [InlineData(TaskAction.Defer, TaskState.Deferred)]
    public void SkippedCanceledDeferredRequiredWorkIsNeverCountedAsCompleted(TaskAction action, TaskState state)
    {
        var root = Node(direct: false); var child = Node(root); TaskItem[] nodes = [root, child];
        TaskLifecycle.Apply(nodes, child.Id, action, null, Now);
        Assert.Equal(state, child.State); Assert.False(child.DirectWorkCompleted); Assert.Null(child.CompletedAt);
        Assert.Equal(TaskState.Pending, root.State); Assert.Equal(0, TaskProgressCalculator.Calculate(nodes, root.Id).CompletedComponentCount);
    }
    [Fact]
    public void OptionalOpenChildDoesNotBlockParentAndRemainsVisibleAsOpen()
    {
        var root = Node(direct: false); var required = Node(root); var optional = Node(root); optional.RequiredForParent = false;
        TaskItem[] nodes = [root, required, optional]; TaskLifecycle.Apply(nodes, required.Id, TaskAction.Complete, null, Now);
        Assert.Equal(TaskState.Completed, root.State); Assert.Equal(TaskState.Pending, optional.State);
        var progress = TaskProgressCalculator.Calculate(nodes, root.Id); Assert.True(progress.HasOpenChildren); Assert.Equal(0, progress.IncompleteRequiredChildCount);
    }
    [Fact]
    public void CountAndDurationProgressAreSeparateAndUnknownDurationHasNoFalsePercentage()
    {
        var root = Node(direct: false); var one = Node(root, seconds: 600); var two = Node(root, seconds: 1800); TaskItem[] nodes = [root, one, two];
        TaskLifecycle.Apply(nodes, one.Id, TaskAction.Complete, null, Now);
        var progress = TaskProgressCalculator.Calculate(nodes, root.Id); Assert.Equal(.5, progress.CountProgress); Assert.Equal(.25, progress.DurationProgress);
        two.DirectEstimatedSeconds = null; progress = TaskProgressCalculator.Calculate(nodes, root.Id);
        Assert.Null(progress.DurationProgress); Assert.Equal(1, progress.UnknownEstimateCount); Assert.Equal(600, progress.KnownCompletedEstimatedSeconds);
    }
    [Fact]
    public void CompletingOnlyOwnWorkDoesNotCompleteOpenRequiredChildrenOrScheduleOwnWorkAgain()
    {
        var root = Node(seconds: 600); var child = Node(root, seconds: 1200); TaskItem[] nodes = [root, child];
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.CompleteDirectWork, null, Now);
        Assert.Equal(TaskState.Pending, root.State); Assert.True(root.DirectWorkCompleted); Assert.Equal(TaskState.Pending, child.State);
        Assert.Equal(child.Id, Assert.Single(WorkloadCalculator.Calculate(nodes).Components).TaskId);
        TaskLifecycle.Apply(nodes, root.Id, TaskAction.ReopenDirectWork, null, Now);
        Assert.False(root.DirectWorkCompleted); Assert.Equal(2, WorkloadCalculator.Calculate(nodes).Components.Length);
    }
}
