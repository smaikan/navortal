using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class WorkloadCalculatorTests
{
    private static TaskItem Node(TaskItem? parent = null, long? minutes = null, bool direct = true, long? budgetMinutes = null) => new()
    { Id = Guid.NewGuid(), ParentTaskId = parent?.Id, HasDirectWork = direct, DirectEstimatedSeconds = minutes * 60, TargetBudgetSeconds = budgetMinutes * 60 };
    [Fact]
    public void TwentyFortyThirtyEqualsNinetyWithoutCountingContainer()
    {
        var root = Node(direct: false);
        var result = WorkloadCalculator.Calculate([root, Node(root, 20), Node(root, 40), Node(root, 30)]);
        Assert.Equal(90 * 60, result.Summaries[root.Id].CalculatedTotalSeconds); Assert.Equal(3, result.Components.Length);
    }
    [Fact]
    public void NestedFifteenTwentyAndTwentyFiveEqualsSixty()
    {
        var root = Node(direct: false); var branch = Node(root, direct: false);
        var result = WorkloadCalculator.Calculate([root, branch, Node(branch, 15), Node(branch, 20), Node(root, 25)]);
        Assert.Equal(60 * 60, result.Summaries[root.Id].CalculatedTotalSeconds); Assert.Equal(35 * 60, result.Summaries[branch.Id].CalculatedTotalSeconds);
    }
    [Fact]
    public void VisualThirtyInformationFifteenTwentyTwentyFiveAndReviewTwentyFiveEquals115()
    {
        var root = Node(direct: false); var info = Node(root, direct: false);
        var result = WorkloadCalculator.Calculate([root, Node(root, 30), info, Node(info, 15), Node(info, 20), Node(info, 25), Node(root, 25)]);
        Assert.Equal(115 * 60, result.Summaries[root.Id].CalculatedTotalSeconds); Assert.Equal(5, result.Components.Length);
    }
    [Fact]
    public void Budget240AndChildren180LeavesSixtyDifferenceWithoutProducingExtraWork()
    {
        var root = Node(direct: false, budgetMinutes: 240);
        var result = WorkloadCalculator.Calculate([root, Node(root, 60), Node(root, 60), Node(root, 60)]);
        var summary = result.Summaries[root.Id];
        Assert.Equal(180 * 60, summary.CalculatedTotalSeconds); Assert.Equal(240 * 60, summary.TargetBudgetSeconds);
        Assert.Equal(60 * 60, summary.TargetDifferenceSeconds); Assert.Equal(180 * 60, result.Components.Sum(x => x.EstimatedSeconds));
    }
    [Fact]
    public void KnownNinetyPlusTwoUnknownsNeverClaimsACompleteTotalOrBudgetDifference()
    {
        var root = Node(direct: false, budgetMinutes: 240);
        var summary = WorkloadCalculator.Calculate([root, Node(root, 90), Node(root), Node(root)]).Summaries[root.Id];
        Assert.Equal(90 * 60, summary.KnownEstimatedSeconds); Assert.Equal(2, summary.UnknownEstimateCount);
        Assert.Null(summary.CalculatedTotalSeconds); Assert.Null(summary.TargetDifferenceSeconds);
    }
    [Fact]
    public void ParentOwnWorkIsCountedOnceAndClosedWorkIsNotAPlanningComponent()
    {
        var root = Node(minutes: 10); var child = Node(root, 20);
        var result = WorkloadCalculator.Calculate([root, child]);
        Assert.Equal(30 * 60, result.Summaries[root.Id].CalculatedTotalSeconds); Assert.Equal(2, result.Components.Length);
        root.State = TaskState.Completed;
        result = WorkloadCalculator.Calculate([root, child]);
        Assert.Equal(child.Id, Assert.Single(result.Components).TaskId);
        Assert.Equal(30 * 60, result.Summaries[root.Id].CalculatedTotalSeconds);
    }
    [Fact]
    public void ZeroEstimateDiffersFromUnknownAndDoesNotCompleteTask()
    {
        var zero = Node(minutes: 0); var unknown = Node(); var result = WorkloadCalculator.Calculate([zero, unknown]);
        Assert.Equal(0, result.Summaries[zero.Id].CalculatedTotalSeconds); Assert.Null(result.Summaries[unknown.Id].CalculatedTotalSeconds);
        Assert.Equal(TaskState.Pending, zero.State); Assert.Equal(2, result.Components.Length);
    }
    [Fact]
    public void FiveThousandLevelsDoNotUseRecursiveCallStack()
    {
        var nodes = new List<TaskItem>(); TaskItem? previous = null;
        for (var i = 0; i < 5000; i++) { var next = Node(previous, direct: false); nodes.Add(next); previous = next; }
        previous!.HasDirectWork = true; previous.DirectEstimatedSeconds = 60;
        var result = WorkloadCalculator.Calculate(nodes);
        Assert.Equal(60, result.Summaries[nodes[0].Id].CalculatedTotalSeconds); Assert.Single(result.Components);
    }
    [Fact]
    public void CycleAndOverflowAreExplicitFailures()
    {
        var a = Node(); var b = Node(a); a.ParentTaskId = b.Id;
        Assert.Throws<InvalidOperationException>(() => WorkloadCalculator.Calculate([a, b]));
        var root = Node(); root.DirectEstimatedSeconds = long.MaxValue; var child = Node(root); child.DirectEstimatedSeconds = 1;
        Assert.Throws<OverflowException>(() => WorkloadCalculator.Calculate([root, child]));
    }
}
