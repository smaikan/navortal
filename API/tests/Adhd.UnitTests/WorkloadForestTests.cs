using Adhd.Domain.Tasks;

namespace Adhd.UnitTests;

public sealed class WorkloadForestTests
{
    [Fact]
    public void AssignedParentAndChildAndDuplicateMembershipCountPhysicalWorkOnce()
    {
        var parent = new TaskItem { Id = Guid.NewGuid(), DirectEstimatedSeconds = 600, TargetBudgetSeconds = 14400 };
        var child = new TaskItem { Id = Guid.NewGuid(), ParentTaskId = parent.Id, DirectEstimatedSeconds = 1200 };
        var summary = WorkloadForestCalculator.Calculate([parent, child, child]);
        Assert.Equal(2, summary.TaskCount); Assert.Equal(2, summary.DirectComponentCount); Assert.Equal(1800, summary.CalculatedTotalSeconds);
    }
    [Fact]
    public void MemberWhoseParentBelongsElsewhereStillCountsItsOwnSubtreeOnlyOnce()
    {
        var parent = new TaskItem { Id = Guid.NewGuid(), DirectEstimatedSeconds = 600 };
        var child = new TaskItem { Id = Guid.NewGuid(), ParentTaskId = parent.Id, DirectEstimatedSeconds = 1200 };
        Assert.Equal(600, WorkloadForestCalculator.Calculate([parent]).CalculatedTotalSeconds);
        Assert.Equal(1200, WorkloadForestCalculator.Calculate([child]).CalculatedTotalSeconds);
    }
    [Fact]
    public void UnknownAndArchivedMembershipHaveExplicitDifferentMeanings()
    {
        var known = new TaskItem { Id = Guid.NewGuid(), DirectEstimatedSeconds = 5400 };
        var unknown = new TaskItem { Id = Guid.NewGuid() };
        var summary = WorkloadForestCalculator.Calculate([known, unknown]);
        Assert.Equal(5400, summary.KnownEstimatedSeconds); Assert.Equal(1, summary.UnknownEstimateCount); Assert.Null(summary.CalculatedTotalSeconds);
        unknown.ArchivedAt = DateTimeOffset.UtcNow; summary = WorkloadForestCalculator.Calculate([known, unknown]);
        Assert.Equal(1, summary.TaskCount); Assert.Equal(5400, summary.CalculatedTotalSeconds);
    }
}
