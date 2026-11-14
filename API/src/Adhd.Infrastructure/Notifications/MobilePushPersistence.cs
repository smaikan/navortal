using Adhd.Domain.Notifications;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

internal static class MobilePushPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<MobilePushDevice>(b =>
        {
            b.ToTable("mobile_push_devices"); b.HasKey(x => x.InstallationId);
            b.Property(x => x.ProtectedToken).HasMaxLength(8192); b.Property(x => x.TokenHash).HasMaxLength(64);
            b.HasIndex(x => x.TokenHash).IsUnique(); b.HasIndex(x => new { x.UserId, x.Active });
            b.Property(x => x.RequestHash).HasMaxLength(64); b.Property(x => x.Permission).HasMaxLength(20);
            b.Property(x => x.AppVersion).HasMaxLength(32); b.Property(x => x.OsVersion).HasMaxLength(64);
            b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<MobilePushPreference>(b =>
        {
            b.ToTable("mobile_push_preferences"); b.HasKey(x => x.UserId); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<MobilePushRoute>(b =>
        {
            b.ToTable("mobile_push_routes"); b.HasKey(x => new { x.UserId, x.NotificationId, x.SnoozeCount });
            b.Property(x => x.Channel).HasMaxLength(10);
            b.HasOne<Adhd.Domain.Jobs.NotificationIntent>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.NotificationId })
                .HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<MobilePushDelivery>(b =>
        {
            b.ToTable("mobile_push_deliveries"); b.HasKey(x => x.Id); b.HasIndex(x => new { x.UserId, x.NotificationId, x.SnoozeCount }).IsUnique();
            b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.Property(x => x.LastErrorCode).HasMaxLength(60);
            b.HasOne<MobilePushRoute>().WithMany().HasForeignKey(x => new { x.UserId, x.NotificationId, x.SnoozeCount }).OnDelete(DeleteBehavior.Restrict);
            // Owner/binding are immutable delivery snapshots, never rewritten on account changes.
            b.HasOne<MobilePushDevice>().WithMany().HasForeignKey(x => x.InstallationId).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
