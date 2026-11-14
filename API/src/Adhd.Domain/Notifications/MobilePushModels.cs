namespace Adhd.Domain.Notifications;

public sealed class MobilePushDevice
{
    public Guid InstallationId { get; set; }
    public Guid UserId { get; set; }
    public Guid SessionId { get; set; }
    public string? ProtectedToken { get; set; }
    public string? TokenHash { get; set; }
    public long BindingVersion { get; set; } = 1;
    public long ClientSequence { get; set; }
    public string RequestHash { get; set; } = "";
    public string Permission { get; set; } = "notDetermined";
    public bool RemindersChannelEnabled { get; set; }
    public string AppVersion { get; set; } = "";
    public long BuildNumber { get; set; }
    public string OsVersion { get; set; } = "";
    public bool Active { get; set; }
    public long Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
}

public sealed class MobilePushPreference
{
    public Guid UserId { get; set; }
    public bool Enabled { get; set; } = true;
    public long Version { get; set; } = 1;
}

// A single durable channel decision per notification/snooze round. Web subscriptions stay intact.
public sealed class MobilePushRoute
{
    public Guid UserId { get; set; }
    public Guid NotificationId { get; set; }
    public int SnoozeCount { get; set; }
    public string Channel { get; set; } = "Web";
}

public enum MobilePushDeliveryState { Pending, Sending, Accepted, Rejected, Obsolete, Unknown }

public sealed class MobilePushDelivery
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid NotificationId { get; set; }
    public int SnoozeCount { get; set; }
    public Guid InstallationId { get; set; }
    public long BindingVersion { get; set; }
    public MobilePushDeliveryState State { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? ProviderAcceptedAt { get; set; }
    public DateTimeOffset? DisplayedAt { get; set; }
    public DateTimeOffset? OpenedAt { get; set; }
    public string? LastErrorCode { get; set; }
}
