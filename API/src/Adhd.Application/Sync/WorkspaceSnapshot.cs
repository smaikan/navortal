using Adhd.Application.Focus;
using Adhd.Application.Work;
using Adhd.Domain.Preferences;

namespace Adhd.Application.Sync;

// Burada sadece görünüm tercihleri var. Tüm ayarları yazmak için bu veriyi kullanma.
public sealed record WorkspacePreferencesView(long Version, string TimeZoneId, string TimeFormat,
    int WeekStartsOn, bool SupportEnabled, bool HasWorkingWindows, UiSupports UiSupports);

// Yalnız buradaki kaynaklarla gün özetini doğrula. Bildirim ve diğer kaynaklar bu okumaya dahil değil.
public sealed record DayReadVersions(long Planning, long Notes, long SpecialDays);
public sealed record ReadCoverage(DayReadVersions Versions, DateTimeOffset ServerNow);

// Çalışma alanını hesaba göre tek seferde oku. FocusIncluded, bakılmayan odağı gerçekten boş olandan ayırır.
public sealed record WorkspaceSnapshotView(DateTimeOffset ServerNow, long PlanningVersion,
    WorkspacePreferencesView Preferences, WorkView? ActiveWork, Guid? FocusSessionId,
    bool FocusIncluded, FocusView? ActiveFocus, DayReadVersions Versions);

public interface IWorkspaceSnapshotStore
{
    Task<WorkspaceSnapshotView> ReadWorkspaceAsync(Guid userId, bool includeFocus, CancellationToken ct);
}
