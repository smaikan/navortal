using Adhd.Application.Notifications;
using Adhd.Domain.Focus;

namespace Adhd.UnitTests;

public sealed class NotificationPresentationTests
{
    [Theory]
    [InlineData("Custom", false, "Su iç", "Hatırlatma")]
    [InlineData("ScheduleStart", true, "Planlı iş yaklaşıyor", "Su iç")]
    [InlineData("ScheduleStart", false, "Planlı iş başlıyor", "Su iç")]
    [InlineData("ScheduleEnd", true, "Planlı işin bitişi yaklaşıyor", "Su iç")]
    [InlineData("ScheduleEnd", false, "Planlı işin bitiş zamanı geldi", "Su iç")]
    [InlineData("TaskDeadline", true, "Son teslim yaklaşıyor", "Su iç")]
    [InlineData("TaskDeadline", false, "Son teslim zamanı geldi", "Su iç")]
    [InlineData("ReturnToTask", false, "İşe dönüş hatırlatması", "Su iç")]
    [InlineData("SpecialDay", false, "Özel gün hatırlatması", "Su iç")]
    [InlineData("BreakEnd", false, "Mola bitti", "Yeni bir pomodoroya başlayabilirsin.")]
    public void UsesKindAndActualLeadPosition(string kind, bool early, string title, string body)
    {
        Assert.Equal(new NotificationMessage(title, body), NotificationPresentation.Build(kind, "  Su iç  ", early));
    }

    [Theory]
    [InlineData(FocusState.Working, false, "Molaya geçebilir veya çalışmaya devam edebilirsin.")]
    [InlineData(FocusState.Paused, false, "Molaya geçebilir veya çalışmaya devam edebilirsin.")]
    [InlineData(FocusState.Break, false, "Molaya geçebilir veya çalışmaya devam edebilirsin.")]
    [InlineData(FocusState.Break, true, "Molan başladı.")]
    [InlineData(FocusState.AwaitingNext, true, "Yeni bir pomodoroya başlayabilirsin.")]
    public void FocusTextFollowsConfirmedPhaseWithoutClaimingAnUnstartedBreak(FocusState phase, bool started, string body)
    {
        Assert.Equal(new("Pomodoro süresi doldu", body), NotificationPresentation.Build("FocusTarget", focusState: phase, breakStarted: started));
    }

    [Fact]
    public void BlankLegacyNamesHaveFallbackAndLongNamesDoNotSplitUtf16Pairs()
    {
        Assert.Equal(new("Hatırlatma", "Hatırlatma"), NotificationPresentation.Build("Custom", "   "));
        Assert.Equal("İşine kaldığın yerden devam edebilirsin.", NotificationPresentation.Build("ReturnToTask").Body);
        Assert.Equal(new string('a', 200), NotificationPresentation.Build("Custom", new string('a', 201)).Title);
        Assert.Equal(new string('a', 199), NotificationPresentation.Build("Custom", new string('a', 199) + "🙂").Title);
        Assert.Equal(new("Gün planlayıcısı", "Bir hatırlatmanız var."), NotificationPresentation.Build("FutureKind", "private"));
    }
}
