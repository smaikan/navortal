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
    int SnoozeCount, bool SoundEnabled, long Version);
public sealed record NotificationPage(NotificationView[] Items, int Offset, int Limit, int Total);
public sealed record SnoozeNotification(long Version, int? Seconds = null);
public sealed record CustomReminderCommand(string Title, DateTimeOffset DueAt, Guid? TaskId = null, long? Version = null);
public sealed record CustomReminderView(Guid Id, string Title, DateTimeOffset DueAt, Guid? TaskId, bool Canceled, long Version);
public interface INotificationStore
{
    Task<NotificationPreferencesView> PreferencesAsync(Guid user, CancellationToken ct);
    Task<NotificationPreferencesView> UpdatePreferencesAsync(Guid user, UpdateNotificationPreferences command, CancellationToken ct);
    Task<SubscriptionView[]> SubscriptionsAsync(Guid user, CancellationToken ct);
    Task<SubscriptionView> SubscribeAsync(Guid user, RegisterSubscription command, CancellationToken ct);
    Task UnsubscribeAsync(Guid user, Guid id, long version, CancellationToken ct);
    Task<NotificationPage> ListAsync(Guid user, int offset, int limit, CancellationToken ct);
    Task<NotificationView> GetAsync(Guid user, Guid id, CancellationToken ct);
    Task<NotificationView> SnoozeAsync(Guid user, Guid id, SnoozeNotification command, CancellationToken ct);
    Task<NotificationView> ReadAsync(Guid user, Guid id, long version, CancellationToken ct);
    Task<CustomReminderView[]> RemindersAsync(Guid user, int offset, int limit, CancellationToken ct);
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
public sealed record PushEnvelope(Guid NotificationId, Guid RecipientUserId, string Tag, string Title, string Body, string Url, bool Silent, int SnoozeCount = 0);
public sealed record PushSendResult(int StatusCode, TimeSpan? RetryAfter = null);
public interface IPushTransport { Task<PushSendResult> SendAsync(PushSubscriptionRecord subscription, PushEnvelope envelope, CancellationToken ct); }
