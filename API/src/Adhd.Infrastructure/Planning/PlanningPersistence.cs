using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Planning;

internal static class PlanningPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<DailyPlan>(b =>
        {
            b.ToTable("daily_plans", t => t.HasCheckConstraint("CK_daily_plan_version", "\"Version\" > 0"));
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.HasIndex(x => new { x.UserId, x.LocalDate }).IsUnique();
            b.Property(x => x.TimeZoneId).HasMaxLength(100); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, x.Id, x.CurrentRevisionId }).HasPrincipalKey(x => new { x.UserId, x.DailyPlanId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, x.Id, x.BaselineRevisionId }).HasPrincipalKey(x => new { x.UserId, x.DailyPlanId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<TaskSchedule>(b =>
        {
            b.ToTable("task_schedules", t =>
            {
                t.HasCheckConstraint("CK_schedule_range", "\"StartsAt\" < \"EndsAt\"");
                t.HasCheckConstraint("CK_schedule_kind", "(\"Kind\" = 'Work' AND \"TaskId\" IS NOT NULL) OR (\"Kind\" IN ('Break','Buffer') AND \"TaskId\" IS NULL)");
                t.HasCheckConstraint("CK_schedule_version", "\"Version\" > 0");
                t.HasCheckConstraint("CK_schedule_state", "\"State\" IN ('Planned','Removed')");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id });
            b.HasIndex(x => new { x.UserId, x.Id, x.TaskId }).IsUnique();
            b.HasIndex(x => new { x.UserId, x.DailyPlanId, x.StartsAt }); b.HasIndex(x => new { x.UserId, x.TaskId, x.EndsAt });
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.TaskSnapshot).HasColumnType("jsonb"); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<DailyPlan>().WithMany().HasForeignKey(x => new { x.UserId, x.DailyPlanId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskSchedule>().WithMany().HasForeignKey(x => new { x.UserId, x.OriginScheduleId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<DayItem>(b =>
        {
            b.ToTable("day_items", t =>
            {
                t.HasCheckConstraint("CK_day_item_version", "\"Version\" > 0");
                t.HasCheckConstraint("CK_day_item_state", "\"State\" IN ('Planned','Removed','Scheduled')");
                t.HasCheckConstraint("CK_day_item_sort", "\"SortOrder\" >= 0");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id });
            b.HasIndex(x => new { x.UserId, x.LocalDate, x.SortOrder });
            b.HasIndex(x => new { x.UserId, x.LocalDate, x.TaskId }).IsUnique().HasFilter("\"State\" = 'Planned'");
            b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<PlanRevision>(b =>
        {
            b.ToTable("plan_revisions", t => t.HasCheckConstraint("CK_revision_number", "\"Number\" > 0")); b.HasKey(x => x.Id);
            b.HasAlternateKey(x => new { x.UserId, x.Id }); b.HasAlternateKey(x => new { x.UserId, x.DailyPlanId, x.Id });
            b.HasIndex(x => new { x.UserId, x.DailyPlanId, x.Number }).IsUnique(); b.HasIndex(x => new { x.UserId, x.ChangeSetId });
            b.HasIndex(x => new { x.UserId, x.ReversesChangeSetId });
            b.Property(x => x.Trigger).HasMaxLength(30); b.Property(x => x.Reason).HasMaxLength(2000); b.Property(x => x.AlgorithmVersion).HasMaxLength(60);
            b.HasOne<DailyPlan>().WithMany().HasForeignKey(x => new { x.UserId, x.DailyPlanId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, x.DailyPlanId, x.PreviousRevisionId }).HasPrincipalKey(x => new { x.UserId, x.DailyPlanId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<PlanRevisionItem>(b =>
        {
            b.ToTable("plan_revision_items"); b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.ScheduleId, x.Id });
            b.HasIndex(x => new { x.UserId, x.RevisionId, x.ScheduleId }).IsUnique(); b.Property(x => x.Snapshot).HasColumnType("jsonb");
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, x.RevisionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskSchedule>().WithMany().HasForeignKey(x => new { x.UserId, x.ScheduleId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<PlanRevisionChange>(b =>
        {
            b.ToTable("plan_revision_changes"); b.HasKey(x => x.Id); b.Property(x => x.Type).HasMaxLength(30);
            b.Property(x => x.Before).HasColumnType("jsonb"); b.Property(x => x.After).HasColumnType("jsonb");
            b.HasIndex(x => new { x.UserId, x.RevisionId, x.Id });
            b.HasOne<PlanRevision>().WithMany().HasForeignKey(x => new { x.UserId, x.RevisionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskSchedule>().WithMany().HasForeignKey(x => new { x.UserId, x.ScheduleId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<WorkSession>(b =>
        {
            b.ToTable("work_sessions", t => t.HasCheckConstraint("CK_work_plan_context", "(\"StartedScheduleId\" IS NULL AND \"StartedRevisionItemId\" IS NULL) OR (\"TaskId\" IS NOT NULL AND \"StartedScheduleId\" IS NOT NULL AND \"StartedRevisionItemId\" IS NOT NULL)"));
            b.HasOne<TaskSchedule>().WithMany().HasForeignKey(x => new { x.UserId, x.StartedScheduleId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<PlanRevisionItem>().WithMany().HasForeignKey(x => new { x.UserId, x.StartedScheduleId, x.StartedRevisionItemId }).HasPrincipalKey(x => new { x.UserId, x.ScheduleId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
