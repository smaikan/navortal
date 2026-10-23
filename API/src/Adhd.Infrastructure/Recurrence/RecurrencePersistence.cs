using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

internal static class RecurrencePersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<RecurrenceTemplate>(b =>
        {
            b.ToTable("recurrence_templates", t => t.HasCheckConstraint("CK_recurrence_version", "\"Version\">0")); b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.Version).IsConcurrencyToken(); b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict); b.HasIndex(x => new { x.UserId, x.CreatedAt, x.Id });
        });
        model.Entity<RecurrenceDefinition>(b =>
        {
            b.ToTable("recurrence_definitions", t => t.HasCheckConstraint("CK_recurrence_definition_number", "\"Number\">0")); b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.TemplateId, x.Id });
            b.Property(x => x.Rule).HasColumnType("jsonb"); b.Property(x => x.TaskDefaults).HasColumnType("jsonb"); b.HasIndex(x => new { x.UserId, x.TemplateId, x.Number }).IsUnique();
            b.HasOne<RecurrenceTemplate>().WithMany().HasForeignKey(x => new { x.UserId, x.TemplateId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<RecurrenceOccurrence>(b =>
        {
            b.ToTable("recurrence_occurrences", t =>
            {
                t.HasCheckConstraint("CK_occurrence_state", "\"State\" IN ('Materialized','Skipped','Canceled') AND (\"State\"<>'Materialized' OR \"TaskId\" IS NOT NULL)");
                t.HasCheckConstraint("CK_occurrence_task_version", "(\"TaskId\" IS NULL)=(\"SyncedTaskVersion\" IS NULL) AND (\"SyncedTaskVersion\" IS NULL OR \"SyncedTaskVersion\">0)");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20); b.Property(x => x.TimeZoneId).HasMaxLength(100); b.Property(x => x.Reason).HasMaxLength(100);
            b.HasIndex(x => new { x.UserId, x.TemplateId, x.LocalDate }).IsUnique(); b.HasIndex(x => new { x.UserId, x.TaskId }).IsUnique().HasFilter("\"TaskId\" IS NOT NULL");
            b.HasOne<RecurrenceTemplate>().WithMany().HasForeignKey(x => new { x.UserId, x.TemplateId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<RecurrenceDefinition>().WithMany().HasForeignKey(x => new { x.UserId, x.TemplateId, x.DefinitionId }).HasPrincipalKey(x => new { x.UserId, x.TemplateId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<RecurrenceDefinition>().WithMany().HasForeignKey(x => new { x.UserId, x.TemplateId, x.AppliedDefinitionId }).HasPrincipalKey(x => new { x.UserId, x.TemplateId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
