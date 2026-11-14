using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace Adhd.Application.Notifications;

public sealed class RegisterMobilePushDevice
{
    [Required, JsonRequired] public Guid ExpectedUserId { get; set; }
    [Required, StringLength(4096, MinimumLength = 1)] public string FcmToken { get; set; } = "";
    [Range(0, long.MaxValue), JsonRequired] public long BindingVersion { get; set; }
    [Range(1, long.MaxValue), JsonRequired] public long ClientSequence { get; set; }
    [Required, RegularExpression("^android$")] public string Platform { get; set; } = "android";
    [Required, RegularExpression("^tr\\.com\\.navortal$")] public string PackageName { get; set; } = "tr.com.navortal";
    [Required, StringLength(32, MinimumLength = 1)] public string AppVersion { get; set; } = "";
    [Range(1, long.MaxValue)] public long BuildNumber { get; set; }
    [StringLength(64)] public string OsVersion { get; set; } = "";
    [Required, RegularExpression("^(granted|denied|notDetermined)$")] public string Permission { get; set; } = "notDetermined";
    public bool RemindersChannelEnabled { get; set; }
}
public sealed record MobilePushDeviceView(Guid InstallationId, Guid UserId, long BindingVersion, long ClientSequence,
    long Version, bool Active, string Permission, bool RemindersChannelEnabled, string Platform, string PackageName,
    string AppVersion, long BuildNumber, string OsVersion, DateTimeOffset LastSeenAt, bool FcmAvailable);
public sealed record MobilePushPreferencesView(bool Enabled, long Version, bool FcmAvailable);
public sealed record UpdateMobilePushPreferences([property: JsonRequired] Guid ExpectedUserId, [property: JsonRequired] long Version, [property: JsonRequired] bool Enabled);
public sealed record RemoveMobilePushDevice([property: JsonRequired] Guid ExpectedUserId, [property: JsonRequired] long BindingVersion, [property: JsonRequired] long ClientSequence);
public sealed record MobilePushReceipt([property: JsonRequired] Guid ExpectedUserId, [property: JsonRequired] Guid InstallationId,
    [property: JsonRequired] long BindingVersion, [property: JsonRequired] int SnoozeCount, [property: JsonRequired] string Stage);
public sealed record MobilePushDisplayView(Guid DeliveryId, Guid NotificationId, int SnoozeCount, bool DisplayAllowed,
    string Reason, DateTimeOffset ServerNow, DateTimeOffset ExpiresAt, bool Silent);

public interface IMobilePushStore
{
    Task<MobilePushDeviceView> GetAsync(Guid user, Guid session, Guid installation, CancellationToken ct);
    Task<MobilePushDeviceView> RegisterAsync(Guid user, Guid session, Guid installation, RegisterMobilePushDevice command, string key, CancellationToken ct);
    Task RemoveAsync(Guid user, Guid session, Guid installation, RemoveMobilePushDevice command, string key, CancellationToken ct);
    Task<MobilePushPreferencesView> PreferencesAsync(Guid user, CancellationToken ct);
    Task<MobilePushPreferencesView> UpdatePreferencesAsync(Guid user, UpdateMobilePushPreferences command, string key, CancellationToken ct);
    Task<MobilePushDisplayView> DisplayAsync(Guid user, Guid session, Guid delivery, Guid installation, long bindingVersion, CancellationToken ct);
    Task ReceiptAsync(Guid user, Guid session, Guid delivery, MobilePushReceipt command, CancellationToken ct);
}
public interface IMobilePushTokenProtector
{
    string Protect(string token);
    string Unprotect(string value);
}
public interface IFcmTransport
{
    bool Available { get; }
    Task<FcmSendResult> SendAsync(string token, IReadOnlyDictionary<string, string> data, TimeSpan ttl, CancellationToken ct);
}
// DefinitelyRejected means the provider did not accept this attempt; only then is Web fallback safe.
public sealed record FcmSendResult(int StatusCode, string? Code = null, bool InvalidToken = false,
    bool DefinitelyRejected = false, TimeSpan? RetryAfter = null);
