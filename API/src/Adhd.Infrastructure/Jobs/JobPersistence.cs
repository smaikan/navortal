using Adhd.Domain.Jobs;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Jobs;

internal static class JobPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<OutboxMessage>(b =>
        {
            b.ToTable("outbox_messages", t =>
            {
                t.HasCheckConstraint("CK_outbox_attempts", "\"Attempts\" BETWEEN 0 AND 5 AND \"Version\">0");
                t.HasCheckConstraint("CK_outbox_state", "\"State\" IN ('Pending','Processing','Completed','Obsolete','Failed')");
                t.HasCheckConstraint("CK_outbox_lease", "(\"State\"='Processing' AND \"LeaseId\" IS NOT NULL AND \"LeaseUntil\" IS NOT NULL) OR (\"State\"<>'Processing' AND \"LeaseId\" IS NULL AND \"LeaseUntil\" IS NULL)");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.EventKey).HasMaxLength(250); b.Property(x => x.Kind).HasMaxLength(40); b.Property(x => x.Payload).HasColumnType("jsonb"); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.Property(x => x.LastErrorCode).HasMaxLength(100); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasIndex(x => new { x.UserId, x.EventKey }).IsUnique(); b.HasIndex(x => new { x.State, x.AvailableAt, x.Id }); b.HasIndex(x => new { x.State, x.LeaseUntil }); b.HasIndex(x => new { x.UserId, x.OccurredAt, x.Id }); b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<JobEffectReceipt>(b =>
        {
            b.ToTable("job_effect_receipts"); b.HasKey(x => x.OutboxId); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.Property(x => x.ResolvedInput).HasColumnType("jsonb"); b.HasOne<OutboxMessage>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.OutboxId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<ReminderWork>(b =>
        {
            b.ToTable("reminder_work"); b.HasKey(x => x.Id); b.Property(x => x.SourceKey).HasMaxLength(250); b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(30); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.HasIndex(x => new { x.UserId, x.SourceKey }).IsUnique(); b.HasIndex(x => new { x.State, x.DueAt, x.Id }); b.HasIndex(x => new { x.UserId, x.TaskId });
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<DailyPlan>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.DailyPlanId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.RevisionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<NotificationIntent>(b =>
        {
            b.ToTable("notification_intents"); b.HasKey(x => x.Id); b.Property(x => x.SourceKey).HasMaxLength(250); b.Property(x => x.Kind).HasMaxLength(40); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.HasIndex(x => new { x.UserId, x.SourceKey }).IsUnique(); b.HasIndex(x => new { x.UserId, x.CreatedAt, x.Id });
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<DailyPlan>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.DailyPlanId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, Id = x.RevisionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
