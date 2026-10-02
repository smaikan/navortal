using Adhd.Domain.Notifications;

namespace Adhd.UnitTests;

public sealed class NotificationPolicyTests
{
    [Fact]
    public void OvernightQuietWindowEndsAtUserLocalMorningAndBoundaryIsExclusive()
    {
        var s = new NotificationSettings(QuietStart: new(22, 0), QuietEnd: new(8, 0));
        Assert.Equal(new DateTimeOffset(2026, 10, 16, 5, 0, 0, TimeSpan.Zero), NotificationPolicy.QuietUntil(s, "Europe/Istanbul", new(2026, 10, 15, 20, 0, 0, TimeSpan.Zero)));
        Assert.Null(NotificationPolicy.QuietUntil(s, "Europe/Istanbul", new(2026, 10, 16, 5, 0, 0, TimeSpan.Zero)));
    }
    [Fact]
    public void QuietEndInGapAdvancesAndRepeatedEndUsesLaterInstant()
    {
        var s = new NotificationSettings(QuietStart: new(0, 0), QuietEnd: new(2, 30));
        Assert.Equal(new DateTimeOffset(2026, 3, 29, 1, 0, 0, TimeSpan.Zero), NotificationPolicy.QuietUntil(s, "Europe/Berlin", new(2026, 3, 29, 0, 30, 0, TimeSpan.Zero)));
        Assert.Equal(new DateTimeOffset(2026, 10, 25, 1, 30, 0, TimeSpan.Zero), NotificationPolicy.QuietUntil(s, "Europe/Berlin", new(2026, 10, 24, 23, 30, 0, TimeSpan.Zero)));
    }
    [Fact]
    public void PreferencesValidatePairedHoursAndExplicitTypeSelection()
    {
        Assert.False(NotificationPolicy.Valid(new(QuietStart: new(22, 0)))); Assert.False(NotificationPolicy.Valid(new(LeadSeconds: -1)));
        Assert.False(NotificationPolicy.Allows(new(FocusTarget: false), "FocusTarget")); Assert.False(NotificationPolicy.Allows(new(Enabled: false), "Custom"));
        Assert.True(NotificationPolicy.Allows(new(), "BreakEnd"));
    }
}
