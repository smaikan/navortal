using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

internal static class NotificationPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<NotificationPreferences>(b =>
        {
            b.ToTable("notification_preferences"); b.HasKey(x => x.UserId); b.Property(x => x.Settings).HasColumnType("jsonb"); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<PushSubscriptionRecord>(b =>
        {
            b.ToTable("push_subscriptions"); b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.Endpoint).HasMaxLength(2048); b.Property(x => x.EndpointHash).HasMaxLength(64); b.Property(x => x.P256dh).HasMaxLength(100); b.Property(x => x.Auth).HasMaxLength(50); b.Property(x => x.Label).HasMaxLength(100); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasIndex(x => x.EndpointHash).IsUnique(); b.HasIndex(x => new { x.UserId, x.Active }); b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<CustomReminder>(b =>
        {
            b.Property(x => x.RepeatSettings).HasColumnType("jsonb");
            b.ToTable("custom_reminders"); b.HasKey(x => x.Id); b.Property(x => x.Title).HasMaxLength(200); b.Property(x => x.Version).IsConcurrencyToken(); b.HasIndex(x => new { x.UserId, x.DueAt, x.Id });
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<NotificationIntent>(b =>
        {
            b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.Version).IsConcurrencyToken();
            b.ToTable("notification_intents", t => t.HasCheckConstraint("CK_notification_versions", "\"Version\">0 AND \"SnoozeCount\">=0"));
        });
        model.Entity<PushDelivery>(b =>
        {
            b.ToTable("push_deliveries"); b.HasKey(x => x.Id); b.Property(x => x.State).HasConversion<string>().HasMaxLength(30); b.HasIndex(x => new { x.UserId, x.NotificationId, x.SnoozeCount, x.SubscriptionId }).IsUnique();
            b.HasOne<NotificationIntent>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.NotificationId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PushSubscriptionRecord>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.SubscriptionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<NotificationClientReceipt>(b =>
        {
            b.ToTable("notification_client_receipts", t => t.HasCheckConstraint("CK_notification_receipt_round", "\"SnoozeCount\">=0"));
            b.HasKey(x => new { x.UserId, x.NotificationId, x.SnoozeCount });
            b.HasOne<NotificationIntent>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.NotificationId })
                .HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
