using Adhd.Application.Notifications;
using Adhd.Domain.Notifications;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed partial class NotificationStore
{
    public async Task RecordReceiptAsync(Guid user, Guid id, RecordNotificationReceipt command, CancellationToken ct)
    {
        if (command.ExpectedUserId != user) throw Missing();
        if (command.SnoozeCount < 0 || !Enum.IsDefined(command.Stage)) throw Invalid("notification_receipt_invalid");
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var notification = await FindNotification(user, id, ct);
        if (command.SnoozeCount > notification.SnoozeCount || !await db.PushDeliveries.AsNoTracking()
            .AnyAsync(x => x.UserId == user && x.NotificationId == id && x.SnoozeCount == command.SnoozeCount, ct))
            throw Invalid("notification_receipt_invalid");
        var receipt = await db.NotificationClientReceipts.SingleOrDefaultAsync(x => x.UserId == user
            && x.NotificationId == id && x.SnoozeCount == command.SnoozeCount, ct);
        if (receipt is null)
        {
            receipt = new() { UserId = user, NotificationId = id, SnoozeCount = command.SnoozeCount };
            db.NotificationClientReceipts.Add(receipt);
        }
        // İstemci saati ve içerik alınmaz. Makbuz yalnız tarayıcının bildirdiği aşamadır.
        if (command.Stage == NotificationReceiptStage.Displayed) receipt.DisplayedAt ??= clock.GetUtcNow();
        else receipt.OpenedAt ??= clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }

    public async Task<NotificationDeliveryStatus> DeliveryStatusAsync(Guid user, Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var notification = await FindNotification(user, id, ct);
        var deliveries = db.PushDeliveries.AsNoTracking().Where(x => x.UserId == user && x.NotificationId == id
            && x.SnoozeCount == notification.SnoozeCount);
        var prepared = await deliveries.MinAsync(x => (DateTimeOffset?)x.CreatedAt, ct);
        var accepted = await deliveries.Where(x => x.State == DeliveryState.Succeeded).MaxAsync(x => x.DeliveredAt, ct);
        var receipt = await db.NotificationClientReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user
            && x.NotificationId == id && x.SnoozeCount == notification.SnoozeCount, ct);
        var mobile = await db.MobilePushDeliveries.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user
            && x.NotificationId == id && x.SnoozeCount == notification.SnoozeCount, ct);
        static DateTimeOffset? Latest(DateTimeOffset? a, DateTimeOffset? b) => a is null ? b : b is null ? a : a > b ? a : b;
        prepared = prepared is null ? mobile?.CreatedAt : mobile is null ? prepared : prepared < mobile.CreatedAt ? prepared : mobile.CreatedAt;
        return new(notification.SnoozeCount, prepared ?? (notification.SnoozeCount == 0 ? notification.ReadyAt : null), Latest(accepted, mobile?.ProviderAcceptedAt),
            Latest(receipt?.DisplayedAt, mobile?.DisplayedAt), Latest(receipt?.OpenedAt, mobile?.OpenedAt), notification.ReadAt);
    }
}
