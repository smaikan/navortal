using Adhd.Domain.Support;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Support;

internal static class SupportPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<TaskItem>().Property(x => x.EnergyDemand).HasConversion<string>().HasMaxLength(10);
        model.Entity<UserNote>(b =>
        {
            b.ToTable("user_notes", t =>
            {
                t.HasCheckConstraint("CK_note_text", "length(btrim(\"Text\"))>0 AND \"Version\">0");
                t.HasCheckConstraint("CK_note_kind", "\"Kind\" IN ('Task','Distraction','NextStep','Daily','General') AND (\"Kind\" NOT IN ('Task','NextStep') OR \"TaskId\" IS NOT NULL) AND ((\"Kind\"='Daily')=(\"LocalDate\" IS NOT NULL))");
                t.HasCheckConstraint("CK_note_conversion", "(\"ConvertedTaskId\" IS NULL)=(\"ConversionHash\" IS NULL)");
                t.HasCheckConstraint("CK_note_display", "\"Display\" IN ('Short','Detailed','Toggle') AND ((\"Display\"='Short')=(\"Title\" IS NULL)) AND (\"Title\" IS NULL OR length(btrim(\"Title\")) BETWEEN 1 AND 200)");
            });
            b.Property(x => x.Title).HasMaxLength(200); b.Property(x => x.Display).HasConversion<string>().HasMaxLength(10).HasDefaultValue(NoteDisplay.Short).HasSentinel((NoteDisplay)(-1));
            b.HasOne<NoteCategory>().WithMany().HasForeignKey(x => new { x.UserId, x.CategoryId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.CategoryId, x.UpdatedAt, x.Id });
            b.HasKey(x => x.Id); b.Property(x => x.Version).IsConcurrencyToken(); b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20); b.Property(x => x.Text).HasMaxLength(10000); b.Property(x => x.TimeZoneId).HasMaxLength(100); b.Property(x => x.ConversionHash).HasMaxLength(64);
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.ConvertedTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<WorkSession>().WithMany().HasForeignKey(x => new { x.UserId, x.WorkSessionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.CreatedAt, x.Id }); b.HasIndex(x => new { x.UserId, x.TaskId, x.UpdatedAt, x.Id }); b.HasIndex(x => new { x.UserId, x.LocalDate, x.Id });
        });
        model.Entity<NoteCategory>(b =>
        {
            b.ToTable("note_categories", t =>
            {
                t.HasCheckConstraint("CK_note_category_name", "length(btrim(\"Name\")) BETWEEN 1 AND 40 AND \"Version\">0");
                t.HasCheckConstraint("CK_note_category_enums", "\"Color\" IN ('Gray','Blue','Teal','Green','Red','Pink','Purple') AND \"ViewMode\" IN ('Cards','List')");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.Version).IsConcurrencyToken(); b.Property(x => x.Name).HasMaxLength(40);
            b.Property(x => x.Color).HasConversion<string>().HasMaxLength(10); b.Property(x => x.ViewMode).HasConversion<string>().HasMaxLength(10); b.Property(x => x.SortOrder).HasPrecision(28, 10);
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.RemovedAt, x.SortOrder });
        });
        model.Entity<SupportDay>(b =>
        {
            b.ToTable("support_days", t => t.HasCheckConstraint("CK_support_day_version", "\"Version\">0")); b.HasKey(x => new { x.UserId, x.LocalDate }); b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.TimeZoneId).HasMaxLength(100); b.Property(x => x.AvailableEnergy).HasConversion<string>().HasMaxLength(10); b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<DailyCriticalTask>(b =>
        {
            b.ToTable("daily_critical_tasks", t => t.HasCheckConstraint("CK_critical_slot", "\"Slot\" BETWEEN 1 AND 3")); b.HasKey(x => new { x.UserId, x.LocalDate, x.TaskId }); b.HasIndex(x => new { x.UserId, x.LocalDate, x.Slot }).IsUnique();
            b.HasOne<SupportDay>().WithMany().HasForeignKey(x => new { x.UserId, x.LocalDate }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
