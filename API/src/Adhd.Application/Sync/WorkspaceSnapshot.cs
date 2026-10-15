using Adhd.Application.Focus;
using Adhd.Application.Work;
using Adhd.Domain.Preferences;

namespace Adhd.Application.Sync;

// Sadece görünüm tercihleri. Tam tercih yazısı olarak kullanılmaz.
public sealed record WorkspacePreferencesView(long Version, string TimeZoneId, string TimeFormat,
    int WeekStartsOn, bool SupportEnabled, bool HasWorkingWindows, UiSupports UiSupports);

// Gün özetini yalnız bu kaynaklar doğrulayabilir. Bildirimler ve diğer kaynaklar bu okumaya girmez.
public sealed record DayReadVersions(long Planning, long Notes, long SpecialDays);
public sealed record ReadCoverage(DayReadVersions Versions, DateTimeOffset ServerNow);

// Hesaba özel tek çalışma alanı okuması. FocusIncluded değerlendirilmemiş odağı doğrulanmış yokluktan ayırır.
public sealed record WorkspaceSnapshotView(DateTimeOffset ServerNow, long PlanningVersion,
    WorkspacePreferencesView Preferences, WorkView? ActiveWork, Guid? FocusSessionId,
    bool FocusIncluded, FocusView? ActiveFocus, DayReadVersions Versions);

public interface IWorkspaceSnapshotStore
{
    Task<WorkspaceSnapshotView> ReadWorkspaceAsync(Guid userId, bool includeFocus, CancellationToken ct);
}
