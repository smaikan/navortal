using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class PlannedRangesTests
{
    private static TaskItem Task(Guid? parent = null, DateOnly? from = null, DateOnly? to = null) =>
        new() { Id = Guid.NewGuid(), UserId = Guid.Empty, ParentTaskId = parent, Title = "t", PlannedFrom = from, PlannedTo = to };
    private static readonly DateOnly Day = new(2026, 10, 24);

    [Fact]
    public void ParentSpansFirstToLastChildDayAndIgnoresItsOwnRangeWhenEveryChildHasOne()
    {
        var root = Task(from: Day.AddDays(-10), to: Day.AddDays(30));
        var a = Task(root.Id, Day, Day.AddDays(2)); var b = Task(root.Id, Day.AddDays(3), Day.AddDays(5));
        var result = PlannedRanges.Effective([root, a, b]);
        Assert.Equal(new PlannedRange(Day, Day.AddDays(5)), result[root.Id]);
    }
    [Fact]
    public void ChildWithoutRangeInheritsTheParentOwnRangeAndKeepsTheParentRangeWide()
    {
        var root = Task(from: Day.AddDays(-10), to: Day.AddDays(30));
        var a = Task(root.Id, Day, Day.AddDays(2)); var open = Task(root.Id);
        var result = PlannedRanges.Effective([root, a, open]);
        Assert.Equal(new PlannedRange(Day.AddDays(-10), Day.AddDays(30)), result[open.Id]);
        Assert.Equal(new PlannedRange(Day.AddDays(-10), Day.AddDays(30)), result[root.Id]);
    }

    [Fact]
    public void OwnRangeAppliesWithoutRangedChildrenAndArchivedChildrenDoNotCount()
    {
        var root = Task(from: Day, to: Day.AddDays(1)); var archived = Task(root.Id, Day.AddDays(-5), Day.AddDays(-4)); archived.ArchivedAt = DateTimeOffset.UnixEpoch;
        var result = PlannedRanges.Effective([root, archived, Task(root.Id)]);
        Assert.Equal(new PlannedRange(Day, Day.AddDays(1)), result[root.Id]);
        Assert.False(result.ContainsKey(archived.Id));
    }

    [Fact]
    public void GrandchildRangesBubbleUpThroughContainersAndDeepChainsDoNotOverflow()
    {
        var nodes = new List<TaskItem> { Task() };
        for (var i = 0; i < 20000; i++) nodes.Add(Task(nodes[^1].Id));
        nodes[^1].PlannedFrom = Day; nodes[^1].PlannedTo = Day;
        var result = PlannedRanges.Effective(nodes);
        Assert.Equal(new PlannedRange(Day, Day), result[nodes[0].Id]);
    }
}
