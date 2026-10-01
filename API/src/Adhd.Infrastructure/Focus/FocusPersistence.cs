using Adhd.Domain.Focus;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Focus;

internal static class FocusPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.Entity<FocusPreset>(b =>
        {
            b.ToTable("focus_presets", t => t.HasCheckConstraint("CK_focus_preset_version", "\"Version\">0")); b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id });
            b.Property(x => x.Name).HasMaxLength(100); b.Property(x => x.Settings).HasColumnType("jsonb"); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasIndex(x => new { x.UserId, x.Name, x.Id }); b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<FocusSession>(b =>
        {
            b.ToTable("focus_sessions", t =>
            {
                t.HasCheckConstraint("CK_focus_version", "\"Version\">0 AND \"CycleNumber\">0");
                t.HasCheckConstraint("CK_focus_state", "\"State\" IN ('Working','Paused','Break','AwaitingNext','Finished','Interrupted')");
                t.HasCheckConstraint("CK_focus_terminal", "(\"State\" IN ('Finished','Interrupted')) = (\"EndedAt\" IS NOT NULL)");
                t.HasCheckConstraint("CK_focus_time", "(\"WorkEndedAt\" IS NULL OR \"WorkEndedAt\">=\"StartedAt\") AND (\"BreakStartedAt\" IS NULL OR \"BreakStartedAt\">=\"WorkEndedAt\") AND (\"BreakEndedAt\" IS NULL OR \"BreakEndedAt\">=\"BreakStartedAt\") AND (\"EndedAt\" IS NULL OR \"EndedAt\">=\"StartedAt\")");
                t.HasCheckConstraint("CK_focus_target", "(\"TargetReachedAt\" IS NULL) = (\"TargetObservedAt\" IS NULL)");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id }); b.Property(x => x.Version).IsConcurrencyToken(); b.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.PresetName).HasMaxLength(100); b.Property(x => x.Settings).HasColumnType("jsonb");
            b.HasOne<WorkSession>().WithMany().HasForeignKey(x => new { x.UserId, x.WorkSessionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<FocusPreset>().WithMany().HasForeignKey(x => new { x.UserId, x.PresetId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<FocusSession>().WithMany().HasForeignKey(x => new { x.UserId, x.PreviousFocusId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => x.UserId).IsUnique().HasFilter("\"State\" NOT IN ('Finished','Interrupted')");
            b.HasIndex(x => new { x.UserId, x.StartedAt, x.Id }); b.HasIndex(x => new { x.UserId, x.PreviousFocusId }).IsUnique().HasFilter("\"PreviousFocusId\" IS NOT NULL");
        });
    }
}
