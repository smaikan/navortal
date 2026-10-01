using Adhd.Domain.Scheduling;
using Adhd.Domain.Support;
using static Adhd.UnitTests.SchedulingEngineTests;

namespace Adhd.UnitTests;

public sealed class SupportRulesTests
{
    [Fact]
    public void EnergyIsOptionalSoftPreferenceAndDoesNotOverrideDeadlineOrPrerequisite()
    {
        var high = Work(1) with { EnergyDemand = EnergyLevel.High }; var low = Work(2) with { EnergyDemand = EnergyLevel.Low };
        var snapshot = Snapshot([high, low]) with { AvailableEnergy = EnergyLevel.Low }; var planned = Run(snapshot); Assert.Equal(low.Id, planned.Blocks[0].TaskId); Assert.Equal("heuristic-v3", planned.AlgorithmVersion);
        var deadline = Run(snapshot with { Tasks = [high with { DeadlineAt = Morning.AddMinutes(30) }, low] }); Assert.Equal(high.Id, deadline.Blocks[0].TaskId);
        var dependency = Run(snapshot with { Dependencies = [new(high.Id, low.Id)] }); Assert.Equal(high.Id, dependency.Blocks[0].TaskId);
        Assert.Equal(high.Id, Run(snapshot with { AvailableEnergy = null }).Blocks[0].TaskId);
    }
    [Fact]
    public void CriticalAndFixedConstraintsOutrankEnergyWithoutIncreasingWorkQuantity()
    {
        var high = Work(1) with { EnergyDemand = EnergyLevel.High, IsCritical = true }; var low = Work(2) with { EnergyDemand = EnergyLevel.Low };
        var fixedBlock = Block(1, null, 30, 60, kind: Adhd.Domain.Planning.ScheduleKind.Break);
        var result = Run(Snapshot([high, low], 1.5) with { AvailableEnergy = EnergyLevel.Low, ExistingBlocks = [fixedBlock] });
        Assert.Equal(high.Id, result.Blocks[0].TaskId); Assert.Contains(result.Blocks, x => x.ExistingScheduleId == fixedBlock.ExistingScheduleId && x.StartsAt == fixedBlock.StartsAt); Assert.Equal(3600d, result.Blocks.Where(x => x.TaskId.HasValue).Sum(x => (x.EndsAt - x.StartsAt).TotalSeconds));
        Assert.Equal(0, SupportRules.EnergyPenalty(null, EnergyLevel.Low));
    }
}
