using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Application.Jobs;

namespace Adhd.Application.Notifications;

public sealed record NotificationPreferencesView(NotificationSettings Settings, long Version);
public sealed record UpdateNotificationPreferences(long Version, NotificationSettings Settings);
public sealed record RegisterSubscription(string Endpoint, string P256dh, string Auth, string Label = "", DateTimeOffset? ExpiresAt = null);
public sealed record SubscriptionView(Guid Id, string ProviderHost, string Label, bool Active, DateTimeOffset? ExpiresAt, long Version);
public sealed record PushConfiguration(bool Enabled, string? PublicKey);
public sealed record NotificationView(Guid Id, string Kind, Guid SourceId, Guid? TaskId, Guid? DailyPlanId, Guid? RevisionId,
    DateTimeOffset OccurredAt, DateTimeOffset? ReadyAt, DateTimeOffset? NotBefore, DateTimeOffset? ReadAt, NotificationIntentState State,
    int SnoozeCount, bool SoundEnabled, long Version, string? Title = null, string? Sound = null);
public sealed record NotificationPage(NotificationView[] Items, int Offset, int Limit, int Total);
public sealed record NotificationInboxSummary(int UnreadCount, DateTimeOffset AsOf);
public sealed record NotificationAlertPage(DateTimeOffset ServerNow, long PreferencesVersion, NotificationView[] Items, string? NextCursor);
public sealed record SnoozeNotification(long Version, int? Seconds = null);
public sealed record CustomReminderCommand(string Title, DateTimeOffset DueAt, Guid? TaskId = null, long? Version = null, ReminderRepeat? Repeat = null);
public sealed record CustomReminderView(Guid Id, string Title, DateTimeOffset DueAt, Guid? TaskId, bool Canceled, long Version, ReminderRepeat? Repeat = null);
public sealed record ReadAllNotificationsResult(int ReadCount, DateTimeOffset ReadAt, NotificationInboxSummary Summary);
public sealed record RecordNotificationReceipt(Guid ExpectedUserId, int SnoozeCount, NotificationReceiptStage Stage);
public sealed record NotificationDeliveryStatus(int SnoozeCount, DateTimeOffset? PreparedAt, DateTimeOffset? ProviderAcceptedAt,
    DateTimeOffset? ClientDisplayedAt, DateTimeOffset? ClientOpenedAt, DateTimeOffset? ReadAt);
public interface INotificationStore
{
    Task<NotificationPreferencesView> PreferencesAsync(Guid user, CancellationToken ct);
    Task<NotificationPreferencesView> UpdatePreferencesAsync(Guid user, UpdateNotificationPreferences command, CancellationToken ct);
    Task<SubscriptionView[]> SubscriptionsAsync(Guid user, CancellationToken ct);
    Task<SubscriptionView> SubscribeAsync(Guid user, RegisterSubscription command, CancellationToken ct);
    Task UnsubscribeAsync(Guid user, Guid id, long version, CancellationToken ct);
    Task<NotificationPage> ListAsync(Guid user, int offset, int limit, CancellationToken ct);
    Task<NotificationInboxSummary> SummaryAsync(Guid user, CancellationToken ct);
    Task RecordReceiptAsync(Guid user, Guid id, RecordNotificationReceipt command, CancellationToken ct);
    Task<NotificationDeliveryStatus> DeliveryStatusAsync(Guid user, Guid id, CancellationToken ct);
    Task<NotificationAlertPage> AlertsAsync(Guid user, int limit, string? cursor, CancellationToken ct);
    Task<NotificationView> GetAsync(Guid user, Guid id, CancellationToken ct);
    Task<NotificationView> SnoozeAsync(Guid user, Guid id, SnoozeNotification command, CancellationToken ct);
    Task<NotificationView> ReadAsync(Guid user, Guid id, long version, CancellationToken ct);
    Task<ReadAllNotificationsResult> ReadAllAsync(Guid user, CancellationToken ct);
    Task<CustomReminderView[]> RemindersAsync(Guid user, int offset, int limit, CancellationToken ct, bool activeOnly = false);
    Task<CustomReminderView> SaveReminderAsync(Guid user, Guid? id, CustomReminderCommand command, string key, CancellationToken ct);
    Task<CustomReminderView> CancelReminderAsync(Guid user, Guid id, long version, CancellationToken ct);
}
public interface INotificationJobs
{
    Task<bool> HandleAsync(OutboxClaim claim, CancellationToken ct);
}
public sealed class JobDeferredException(DateTimeOffset until, bool countAttempt = false) : Exception
{
    public DateTimeOffset Until { get; } = until;
    public bool CountAttempt { get; } = countAttempt;
}
public sealed record PushEnvelope(Guid NotificationId, Guid RecipientUserId, string Tag, string Title, string Body, string Url, bool Silent, int SnoozeCount = 0, string Sound = "soft");
public sealed record PushSendResult(int StatusCode, TimeSpan? RetryAfter = null);
public interface IPushTransport { Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct); }
