using System.Text.Json;
using Adhd.Domain.Notifications;

namespace Adhd.UnitTests;

public sealed class NotificationSoundTests
{
    [Theory]
    [InlineData("FocusTarget", "glass")]
    [InlineData("BreakEnd", "glass")]
    [InlineData("ScheduleEnd", "pulse")]
    [InlineData("Custom", "digital")]
    [InlineData("ReturnToTask", "digital")]
    [InlineData("TaskDeadline", "digital")]
    [InlineData("SpecialDay", "digital")]
    [InlineData("ScheduleStart", "digital")]
    public void AllKindsUseTheirOwnCategory(string kind, string expected)
        => Assert.Equal(expected, NotificationSounds.For(new(PomodoroSound: "glass", ReminderSound: "digital", TaskEndSound: "pulse"), kind));

    [Theory]
    [InlineData(null)] [InlineData("")] [InlineData("Bell")] [InlineData("https://example.test/tone.mp3")] [InlineData("unknown")]
    public void InvalidSoundsCannotEnterAnyPreference(string? sound)
    {
        Assert.False(NotificationPolicy.Valid(new(PomodoroSound: sound!)));
        Assert.False(NotificationPolicy.Valid(new(ReminderSound: sound!)));
        Assert.False(NotificationPolicy.Valid(new(TaskEndSound: sound!)));
    }
    [Fact]
    public void ExistingJsonWithoutTheFieldsKeepsExplicitDefaults()
    {
        var settings = JsonSerializer.Deserialize<NotificationSettings>("{\"soundEnabled\":false}", new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.False(settings.SoundEnabled);
        Assert.Equal(("bell", "marimba", "digital"), (settings.PomodoroSound, settings.ReminderSound, settings.TaskEndSound));
        foreach (var sound in new[] { "bell", "marimba", "digital", "glass", "pulse", "soft" })
            Assert.True(NotificationPolicy.Valid(new(PomodoroSound: sound, ReminderSound: sound, TaskEndSound: sound)));
    }
}
