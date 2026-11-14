using Adhd.Application.Notifications;

namespace Adhd.UnitTests;

public sealed class MobilePushTextTests
{
    private const string Zone = "Europe/Istanbul";
    // 2026-11-13 10:00 UTC = 13:00 İstanbul (UTC+3)
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 10, 0, 0, TimeSpan.Zero);

    private static NotificationMessage Build(string kind, string? name = "Rapor yaz", string? note = null, DateTimeOffset? at = null,
        DateTimeOffset? starts = null, DateTimeOffset? ends = null, DateOnly? rangeEnd = null, int? focus = null, string? special = null,
        string zone = Zone) =>
        MobilePushText.Build(new(kind, name, note, at ?? Now.AddMinutes(30), Now, zone, starts, ends, rangeEnd, focus, special));

    [Fact]
    public void ScheduleStartShowsTaskRangeAndNoteInUserTimeZone()
    {
        var m = Build("ScheduleStart", note: "Taslağı bitir\nikinci satır görünmez", starts: Now.AddMinutes(30), ends: Now.AddMinutes(90));
        Assert.Equal("Rapor yaz", m.Title);
        Assert.Equal("13:30 – 14:30 arası başlıyor · Taslağı bitir", m.Body);
        Assert.Equal("10:30 – 11:30 arası başlıyor", Build("ScheduleStart", starts: Now.AddMinutes(30), ends: Now.AddMinutes(90), zone: "UTC").Body);
    }

    [Fact]
    public void ScheduleEndShowsEndTime() =>
        Assert.Equal(new("Rapor yaz", "Bitiş saati 14:30"), Build("ScheduleEnd", ends: Now.AddMinutes(90)));

    [Theory]
    [InlineData(0, "Aralığın son günü bugün")]
    [InlineData(1, "Aralığın son günü yarın")]
    [InlineData(5, "Aralığın son günü 18 Kasım")]
    [InlineData(-1, "Aralığın son günü 12 Kasım (geçti)")]
    public void TaskDeadlineShowsOnlyTheRangeEndDay(int daysFromToday, string body) =>
        Assert.Equal(new("Rapor yaz", body), Build("TaskDeadline", rangeEnd: new DateOnly(2026, 11, 13).AddDays(daysFromToday)));

    [Fact]
    public void TaskDeadlineWithoutRangeEndUsesTheReminderDay() =>
        Assert.Equal(new("Rapor yaz", "Aralığın son günü bugün"), Build("TaskDeadline"));

    [Fact]
    public void FocusTargetShowsConfiguredWorkLength()
    {
        Assert.Equal(new("Rapor yaz", "Hedeflediğin 25 dk odak süresi doldu"), Build("FocusTarget", focus: 1500));
        Assert.Equal("Hedeflediğin 1 sa 30 dk odak süresi doldu", Build("FocusTarget", focus: 5400).Body);
        Assert.Equal(new("Odak oturumu", "Hedeflediğin odak süresi doldu"), Build("FocusTarget", name: null));
    }

    [Fact]
    public void BreakEndNamesTheTaskToReturnTo()
    {
        Assert.Equal(new("Mola bitti", "Göreve dön: Rapor yaz"), Build("BreakEnd"));
        Assert.Equal(new("Mola bitti", "Yeni bir odak oturumuna başlayabilirsin."), Build("BreakEnd", name: null));
    }

    [Fact]
    public void ReturnToTaskExplainsWhy() =>
        Assert.Equal(new("Rapor yaz", "Çalışmaya ara verdin, devam et"), Build("ReturnToTask"));

    [Fact]
    public void CustomUsesTitleAndNoteOrTheReminderTime()
    {
        Assert.Equal(new("Su iç", "Hatırlatma saati 13:30"), Build("Custom", name: "Su iç"));
        Assert.Equal("Bardağı doldur", Build("Custom", name: "Su iç", note: "Bardağı doldur").Body);
    }

    [Fact]
    public void SpecialDayShowsKindAndDate()
    {
        var at = new DateTimeOffset(2026, 11, 14, 6, 0, 0, TimeSpan.Zero);
        Assert.Equal(new("Ayşe", "Doğum günü · 14 Kasım"), Build("SpecialDay", name: "Ayşe", at: at, special: "Birthday"));
        Assert.Equal("Yıl dönümü · 14 Kasım", Build("SpecialDay", name: "Ayşe", at: at, special: "Anniversary").Body);
    }

    [Theory]
    [InlineData("ScheduleStart", "Planındaki bir görev")]
    [InlineData("ScheduleEnd", "Planındaki bir görev")]
    [InlineData("ReturnToTask", "Planındaki bir görev")]
    [InlineData("TaskDeadline", "Tarih aralığı biten görev")]
    [InlineData("FocusTarget", "Odak oturumu")]
    [InlineData("Custom", "Hatırlatma")]
    [InlineData("SpecialDay", "Özel gün")]
    public void MissingNameFallsBackToGenericTitle(string kind, string title) =>
        Assert.Equal(title, Build(kind, name: "   ").Title);

    [Fact]
    public void UnknownKindUsesGenericText() =>
        Assert.Equal(new("Navortal", "Yeni bir hatırlatman var."), Build("SomethingNew"));

    [Fact]
    public void LongTextsAreCutAtMeaningfulPlacesWithEllipsisWithinLimits()
    {
        var long1 = string.Join(' ', Enumerable.Repeat("uzun görev adı", 30));
        var m = Build("ScheduleStart", name: long1, note: string.Join(' ', Enumerable.Repeat("kısa not", 40)), starts: Now, ends: Now.AddHours(1));
        Assert.InRange(m.Title.Length, 1, MobilePushText.TitleMax);
        Assert.InRange(m.Body.Length, 1, MobilePushText.BodyMax);
        Assert.EndsWith("…", m.Title);
        Assert.DoesNotContain(" …", m.Title);
    }

    [Fact]
    public void CuttingNeverSplitsASurrogatePair()
    {
        var text = new string('a', 118) + "😀😀😀";
        var cut = MobilePushText.Truncate(text, 120);
        Assert.True(cut.Length <= 120);
        Assert.EndsWith("…", cut);
        Assert.True(cut.Where(char.IsHighSurrogate).Count() == cut.Where(char.IsLowSurrogate).Count());
    }

    [Theory]
    [InlineData("Toplantı için ayşe@example.com yaz")]
    [InlineData("Ara: +90 555 123 45 67")]
    [InlineData("Parola: abc")]
    [InlineData("IBAN TR33 0006 1005 1978 6457 8413 26")]
    public void NotesWithPersonalOrCredentialLookingContentAreDropped(string note)
    {
        Assert.Null(MobilePushText.SafeNote(note));
        Assert.Equal("13:30 – 14:30 arası başlıyor", Build("ScheduleStart", note: note, starts: Now.AddMinutes(30), ends: Now.AddMinutes(90)).Body);
    }

    [Fact]
    public void ControlCharactersAndRunsOfSpacesAreCollapsed() =>
        Assert.Equal("Rapor yaz ve gönder", Build("ReturnToTask", name: " Rapor\t yaz \u0000 ve   gönder ").Title);

    [Fact]
    public void UnknownTimeZoneFallsBackToUtc() =>
        Assert.Equal("Bitiş saati 11:30", Build("ScheduleEnd", ends: Now.AddMinutes(90), zone: "No/Such_Zone").Body);
}
