using System.Collections.Immutable;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;
using static Adhd.UnitTests.SchedulingEngineTests;

namespace Adhd.UnitTests;

public sealed class MultiDaySchedulingTests
{
    private static SchedulingSnapshot Day(int offset, SchedulingTask[] tasks, int minutes = 120) => Snapshot(tasks, 2) with {
        LocalDate = new DateOnly(2026, 10, 15).AddDays(offset), Policy = new(), WorkingWindows = [new(Morning.AddDays(offset), Morning.AddDays(offset).AddMinutes(minutes))] };
    private static DistributionProposal Run(SchedulingSnapshot[] days, Guid[] tasks, params SchedulingBlock[] outside) => new MultiDaySchedulingEngine(new()).Generate(new(days.ToImmutableArray(), tasks.ToImmutableArray(), outside.ToImmutableArray()));
    private static decimal Seconds(DistributionProposal p, Guid task) => p.Days.SelectMany(x => x.Proposal.Blocks).Where(x => x.TaskId == task).Sum(x => (x.EndsAt - x.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond);
    [Fact]
    public void SixHoursAcrossThreeDaysUsesOneTaskAndNeverDuplicatesRemaining()
    {
        var t = Work(1, 360); var result = Run([Day(0, [t]), Day(1, [t]), Day(2, [t])], [t.Id]);
        Assert.Equal(21600m, Seconds(result, t.Id)); Assert.Equal(3, result.Days.Length); Assert.All(result.Days, d => Assert.Equal(TimeSpan.FromHours(2), Assert.Single(d.Proposal.Blocks).EndsAt - d.Proposal.Blocks[0].StartsAt)); Assert.Empty(result.Unplaced); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void ActualAndOutsideReservationEachReduceTotalOnce()
    {
        var t = Work(1, 360) with { ActualSeconds = 3600 }; var outside = new SchedulingBlock(Id(20), t.Id, ScheduleKind.Work, Morning.AddDays(5), Morning.AddDays(5).AddHours(1));
        var result = Run([Day(0, [t]), Day(1, [t]), Day(2, [t])], [t.Id], outside); Assert.Equal(14400m, Seconds(result, t.Id)); Assert.Empty(result.Unplaced); Assert.Empty(result.Days[2].Proposal.Blocks);
    }
    [Fact]
    public void FutureFixedQuantityIsHeldBeforeFirstDayAllocation()
    {
        var t = Work(1, 120); var fixedBlock = new SchedulingBlock(Id(20), t.Id, ScheduleKind.Work, Morning.AddDays(2), Morning.AddDays(2).AddHours(1), IsFixed: true);
        var result = Run([Day(0, [t]), Day(1, [t]), Day(2, [t]) with { ExistingBlocks = [fixedBlock] }], [t.Id]);
        Assert.Equal(7200m, Seconds(result, t.Id)); Assert.Equal(TimeSpan.FromHours(1), Assert.Single(result.Days[0].Proposal.Blocks).EndsAt - Morning); Assert.Empty(result.Days[1].Proposal.Blocks); Assert.Equal(fixedBlock.StartsAt, Assert.Single(result.Days[2].Proposal.Blocks).StartsAt); Assert.False(result.HasConstraintConflicts);
    }
    [Fact]
    public void PartialCapacityAndUnknownAreReportedAtEndOfExplicitRange()
    {
        var t = Work(1, 360); var unknown = Work(2, 20) with { EstimatedSeconds = null }; var result = Run([Day(0, [t, unknown]), Day(1, [t, unknown])], [t.Id, unknown.Id]);
        Assert.Equal(14400m, Seconds(result, t.Id)); Assert.Equal(7200m, Assert.Single(result.Unplaced, x => x.TaskId == t.Id).RemainingSeconds); Assert.Null(Assert.Single(result.Unplaced, x => x.TaskId == unknown.Id).RemainingSeconds);
    }
    [Fact]
    public void NonSplitWorkIsNotSilentlySpreadAcrossDays()
    {
        var t = Work(1, 360) with { CanSplit = false }; var result = Run([Day(0, [t]), Day(1, [t]), Day(2, [t])], [t.Id]); Assert.Equal(0, Seconds(result, t.Id)); Assert.Equal(21600m, Assert.Single(result.Unplaced).RemainingSeconds);
    }
    [Fact]
    public void ForecastPrerequisiteCanReleaseNextDayButPartialCannot()
    {
        var a = Work(1, 120); var b = Work(2, 60); var first = Day(0, [a, b]) with { Dependencies = [new(a.Id, b.Id)] }; var next = Day(1, [a, b]) with { Dependencies = first.Dependencies };
        var result = Run([first, next], [a.Id, b.Id]); Assert.Equal(b.Id, Assert.Single(result.Days[1].Proposal.Blocks).TaskId); Assert.Empty(result.Unplaced);
        a = a with { EstimatedSeconds = 18000 }; result = Run([first with { Tasks = [a, b] }, next with { Tasks = [a, b] }], [a.Id, b.Id]); Assert.Contains(result.Unplaced, x => x.TaskId == b.Id && x.Reason == UnplacedReason.DependencyBlocked);
    }
    [Fact]
    public void CrossMidnightTransitionIsPaddedAndRenderedOnlyOnTheCurrentDay()
    {
        var a = Work(1, 25); var b = Work(2, 30); var first = Day(0, [a, b]) with { Policy = new(900, 900), WorkingWindows = [new(Morning.AddHours(14.5), Morning.AddHours(14).AddMinutes(55))] };
        var next = Day(1, [a, b]) with { Policy = first.Policy, WorkingWindows = [new(Morning.AddHours(15), Morning.AddHours(16))] };
        var result = Run([first, next], [a.Id, b.Id]); var work = Assert.Single(result.Days[1].Proposal.Blocks, x => x.Kind == ScheduleKind.Work); var buffer = Assert.Single(result.Days[1].Proposal.Blocks, x => x.Kind == ScheduleKind.Buffer);
        Assert.Equal(Morning.AddHours(15).AddMinutes(10), work.StartsAt); Assert.Equal(Morning.AddHours(15), buffer.StartsAt); Assert.Equal(work.StartsAt, buffer.EndsAt); Assert.Empty(result.Unplaced);
    }
    [Fact]
    public void BusyOtherLocalDayWithFrozenDifferentZoneBlocksNewWork()
    {
        var t = Work(1, 120); var day = Day(0, [t], 180) with { ExternalBusyWindows = [new(Morning.AddMinutes(30), Morning.AddMinutes(90))] };
        var direct = new SchedulingEngine().Generate(day, new([t.Id])); Assert.Equal(2, direct.Blocks.Length); Assert.Equal(Morning.AddMinutes(90), direct.Blocks[1].StartsAt); Assert.False(direct.HasConstraintConflicts);
        day = day with { ExistingBlocks = [new(Id(20), t.Id, ScheduleKind.Work, Morning, Morning.AddHours(1), IsFixed: true)] }; Assert.True(new SchedulingEngine().Generate(day, new([t.Id])).HasConstraintConflicts);
    }
}
