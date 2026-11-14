using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class PlannedRangeInheritanceTests
{
    private static TaskItem Node(TaskItem? parent = null, DateOnly? from = null, DateOnly? to = null) => new()
    { Id = Guid.NewGuid(), ParentTaskId = parent?.Id, PlannedFrom = from, PlannedTo = to };
    private static DateOnly D(int day) => new(2026, 11, day);

    [Fact]
    public void ChildWithoutRangeInheritsTheNearestParentRange()
    {
        var root = Node(from: D(10), to: D(20)); var mid = Node(root); var leaf = Node(mid); TaskItem[] nodes = [root, mid, leaf];
        var effective = PlannedRanges.Effective(nodes);
        Assert.Equal(new PlannedRange(D(10), D(20)), effective[leaf.Id]); Assert.Equal(new PlannedRange(D(10), D(20)), effective[mid.Id]);
        Assert.Equal(new PlannedRange(D(10), D(20)), PlannedRanges.OwnOrInherited(nodes)[leaf.Id]);
    }
    [Fact]
    public void ChildKeepsItsOwnRangeAndNearestAncestorWins()
    {
        var root = Node(from: D(1), to: D(30)); var mid = Node(root, D(10), D(20)); var inherits = Node(mid); var own = Node(mid, D(12), D(13)); TaskItem[] nodes = [root, mid, inherits, own];
        var inherited = PlannedRanges.OwnOrInherited(nodes);
        Assert.Equal(new PlannedRange(D(10), D(20)), inherited[inherits.Id]); Assert.Equal(new PlannedRange(D(12), D(13)), inherited[own.Id]);
    }
    [Fact]
    public void NoRangeAnywhereStaysEmptyAndParentWithoutOwnRangeStillDerivesFromChildren()
    {
        var root = Node(); var child = Node(root, D(5), D(6)); var empty = Node(); TaskItem[] nodes = [root, child, empty];
        var effective = PlannedRanges.Effective(nodes);
        Assert.Equal(new PlannedRange(D(5), D(6)), effective[root.Id]); Assert.Null(effective[empty.Id]); Assert.Null(PlannedRanges.OwnOrInherited(nodes)[empty.Id]);
    }
    [Fact]
    public void EndRemindersAreTheEveningBeforeAndTheMorningOfTheLastDayInTheUserZone()
    {
        var zone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul");
        var at = PlannedRanges.EndReminders(new(D(10), D(20)), zone);
        Assert.Equal([new DateTimeOffset(2026, 11, 19, 15, 0, 0, TimeSpan.Zero), new DateTimeOffset(2026, 11, 20, 6, 0, 0, TimeSpan.Zero)], at);
    }
    [Fact]
    public void OnlyOwnRangesInTheSubtreeMarkAParentAsDerivedNotInheritedOnes()
    {
        var root = Node(from: D(1), to: D(30)); var inheriting = Node(root); var mid = Node(root); var leaf = Node(mid, D(5), D(6)); TaskItem[] nodes = [root, inheriting, mid, leaf];
        var derived = PlannedRanges.DerivedFromChildren(nodes);
        Assert.Contains(root.Id, derived); Assert.Contains(mid.Id, derived); Assert.DoesNotContain(inheriting.Id, derived); Assert.DoesNotContain(leaf.Id, derived);
        Assert.Empty(PlannedRanges.DerivedFromChildren([Node(from: D(1), to: D(2))]));
    }
}
