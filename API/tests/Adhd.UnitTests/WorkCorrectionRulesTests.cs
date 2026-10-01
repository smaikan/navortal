using Adhd.Domain.Work;

namespace Adhd.UnitTests;

public sealed class WorkCorrectionRulesTests
{
    private static readonly DateTimeOffset Start = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    [Fact]
    public void ClosedForgottenTimerHasEffectiveEnvelopeAndNoEightHourTotal()
    {
        var session = new WorkSession { State = WorkState.Running, StartedAt = Start };
        WorkSessionSegment[] segments = [new() { StartedAt = Start, EndedAt = Start.AddMinutes(20) }, new() { StartedAt = Start.AddMinutes(50), EndedAt = Start.AddMinutes(90) }];
        WorkCorrectionRules.UpdateEnvelope(session, segments);
        Assert.Equal(WorkState.Finished, session.State); Assert.Equal(Start.AddMinutes(90), session.EndedAt); Assert.Equal(3600m, WorkTime.Seconds(segments, Start.AddHours(8)));
    }
    [Fact]
    public void VoidedHistoryDoesNotStretchEffectiveEnvelopeAndAllVoidedRetainsInspectableRange()
    {
        var session = new WorkSession { State = WorkState.Finished };
        WorkSessionSegment[] segments = [new() { StartedAt = Start, EndedAt = Start.AddHours(4), IsVoided = true }, new() { StartedAt = Start.AddHours(5), EndedAt = Start.AddHours(6) }];
        WorkCorrectionRules.UpdateEnvelope(session, segments); Assert.Equal(Start.AddHours(5), session.StartedAt); Assert.Equal(3600m, WorkTime.Seconds(segments, Start.AddHours(8)));
        segments[1].IsVoided = true; WorkCorrectionRules.UpdateEnvelope(session, segments); Assert.Equal(Start, session.StartedAt); Assert.Equal(0m, WorkTime.Seconds(segments, Start.AddHours(8)));
    }
    [Fact]
    public void CorrectingClosedPartDoesNotFinishPausedOrRunningWork()
    {
        var session = new WorkSession { State = WorkState.Paused };
        WorkSessionSegment[] segments = [new() { StartedAt = Start, EndedAt = Start.AddMinutes(20) }];
        WorkCorrectionRules.UpdateEnvelope(session, segments); Assert.Equal(WorkState.Paused, session.State); Assert.Null(session.EndedAt);
        session.State = WorkState.Running; WorkCorrectionRules.UpdateEnvelope(session, [.. segments, new() { StartedAt = Start.AddMinutes(50) }]); Assert.Equal(WorkState.Running, session.State); Assert.Null(session.EndedAt);
    }
    [Fact]
    public void RangeValidationRejectsFutureNegativeAndOpenVoidButAllowsZeroClosedCorrection()
    {
        var now = Start.AddHours(2);
        Assert.False(WorkCorrectionRules.IsValidRange(Start, now.AddSeconds(1), now, false));
        Assert.False(WorkCorrectionRules.IsValidRange(Start, Start.AddSeconds(-1), now, false));
        Assert.False(WorkCorrectionRules.IsValidRange(Start, null, now, true));
        Assert.False(WorkCorrectionRules.IsValidRange(DateTimeOffset.MinValue, Start, now, false));
        Assert.True(WorkCorrectionRules.IsValidRange(Start, Start, now, false));
        Assert.True(WorkCorrectionRules.IsValidRange(Start, null, now, false));
    }
}
