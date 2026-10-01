using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class TaskGraphRulesTests
{
    private static TaskItem Node(TaskItem? parent = null, bool required = true) => new() { Id = Guid.NewGuid(), ParentTaskId = parent?.Id, RequiredForParent = required };
    private static TaskDependency Edge(TaskItem a, TaskItem b) => new() { Id = Guid.NewGuid(), PredecessorTaskId = a.Id, SuccessorTaskId = b.Id };
    [Theory]
    [InlineData(1)] [InlineData(2)] [InlineData(3)]
    public void SelfTwoAndThreeNodeCyclesAreRejected(int size)
    {
        var nodes = Enumerable.Range(0, size).Select(_ => Node()).ToArray();
        Assert.True(TaskGraphRules.HasCycle(nodes, nodes.Select((n, i) => Edge(n, nodes[(i + 1) % size])).ToArray()));
    }
    [Fact]
    public void RequiredParentDescendantSelfWaitAndCrossBranchCycleAreDetected()
    {
        var a = Node(); var childA = Node(a); var b = Node(); var childB = Node(b); TaskItem[] nodes = [a, childA, b, childB];
        Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(a, childA)]));
        Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(childA, a)]));
        Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(childA, b), Edge(childB, a)]));
        Assert.False(TaskGraphRules.HasCycle(nodes, [Edge(childA, b)]));
    }
    [Fact]
    public void OptionalChildMayRunAfterParentButCannotBeAnInheritedPreconditionForItsOwnStart()
    {
        var parent = Node(); var optional = Node(parent, false); TaskItem[] nodes = [parent, optional];
        Assert.False(TaskGraphRules.HasCycle(nodes, [Edge(parent, optional)]));
        Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(optional, parent)]));
        optional.RequiredForParent = true; Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(parent, optional)]));
    }
    [Theory]
    [InlineData(TaskState.Pending, false)] [InlineData(TaskState.Canceled, false)]
    [InlineData(TaskState.Deferred, false)] [InlineData(TaskState.Skipped, false)] [InlineData(TaskState.Completed, true)]
    public void OnlyActualCompletedPredecessorReleasesSuccessor(TaskState state, bool canStart)
    {
        var a = Node(); a.State = state; var b = Node();
        var decision = TaskGraphRules.CanStart(b, [a, b], [Edge(a, b)]);
        Assert.Equal(canStart, decision.CanStart); Assert.Equal(canStart ? 0 : 1, decision.BlockingPredecessorIds.Length);
    }
    [Fact]
    public void ParentPreconditionsAreInheritedByChildAndMultiplePredecessorsAreRequired()
    {
        var a = Node(); var b = Node(); var parent = Node(); var child = Node(parent); TaskItem[] nodes = [a, b, parent, child];
        TaskDependency[] edges = [Edge(a, parent), Edge(b, child)];
        Assert.Equal(2, TaskGraphRules.CanStart(child, nodes, edges).BlockingPredecessorIds.Length);
        a.State = TaskState.Completed; Assert.Single(TaskGraphRules.CanStart(child, nodes, edges).BlockingPredecessorIds);
        b.State = TaskState.Completed; Assert.True(TaskGraphRules.CanStart(child, nodes, edges).CanStart);
    }
    [Fact]
    public void ReparentAndFiveThousandLevelTreeAreCheckedWithoutPairwiseExpansion()
    {
        var a = Node(); var b = Node(); TaskDependency[] edges = [Edge(a, b)];
        Assert.False(TaskGraphRules.HasCycle([a, b], edges)); a.ParentTaskId = b.Id; Assert.True(TaskGraphRules.HasCycle([a, b], edges));
        var nodes = new List<TaskItem>(); TaskItem? parent = null;
        for (var i = 0; i < 5000; i++) { var node = Node(parent); nodes.Add(node); parent = node; }
        Assert.False(TaskGraphRules.HasCycle(nodes, [])); Assert.True(TaskGraphRules.HasCycle(nodes, [Edge(nodes[0], nodes[^1])]));
    }
}
