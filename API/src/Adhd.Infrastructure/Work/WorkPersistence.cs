using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed class IdempotencyRecord
{
    public Guid UserId { get; set; }
    public string Scope { get; set; } = "";
    public string Key { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string Response { get; set; } = "{}";
    public DateTimeOffset CreatedAt { get; set; }
}
internal static class WorkPersistence
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasPostgresExtension("btree_gist");
        model.Entity<WorkSession>(b =>
        {
            b.ToTable("work_sessions", t =>
            {
                t.HasCheckConstraint("CK_work_version", "\"Version\" > 0");
                t.HasCheckConstraint("CK_work_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");
                t.HasCheckConstraint("CK_work_state", "(\"State\" IN ('Running','Paused') AND \"EndedAt\" IS NULL) OR (\"State\" IN ('Finished','Canceled') AND \"EndedAt\" IS NOT NULL)");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id });
            b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.State).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.Source).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.TimeZoneId).HasMaxLength(100);
            b.Property(x => x.TaskSnapshot).HasColumnType("jsonb");
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => x.UserId).IsUnique().HasFilter("\"State\" = 'Running'");
            b.HasIndex(x => new { x.UserId, x.TaskId }).IsUnique().HasFilter("\"State\" IN ('Running','Paused') AND \"TaskId\" IS NOT NULL");
            b.HasIndex(x => new { x.UserId, x.StartedAt, x.Id });
        });
        model.Entity<WorkSessionSegment>(b =>
        {
            b.ToTable("work_session_segments", t =>
            {
                t.HasCheckConstraint("CK_segment_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");
                t.HasCheckConstraint("CK_segment_version", "\"Version\" > 0");
                t.HasCheckConstraint("CK_segment_void", "NOT \"IsVoided\" OR \"EndedAt\" IS NOT NULL");
            });
            b.HasKey(x => x.Id); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<WorkSession>().WithMany().HasForeignKey(x => new { x.UserId, x.SessionId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => x.UserId).IsUnique().HasFilter("\"EndedAt\" IS NULL AND NOT \"IsVoided\"");
            b.HasIndex(x => new { x.UserId, x.SessionId, x.StartedAt });
        });
        model.Entity<IdempotencyRecord>(b =>
        {
            b.ToTable("idempotency_records"); b.HasKey(x => new { x.UserId, x.Scope, x.Key });
            b.Property(x => x.Scope).HasMaxLength(60); b.Property(x => x.Key).HasMaxLength(128);
            b.Property(x => x.RequestHash).HasMaxLength(64); b.Property(x => x.Response).HasColumnType("jsonb");
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        model.Entity<WorkSessionSegment>().HasAlternateKey(x => new { x.UserId, x.SessionId, x.Id });
        model.Entity<WorkSessionCorrection>(b =>
        {
            b.ToTable("work_session_corrections", t =>
            {
                t.HasCheckConstraint("CK_work_correction_reason", "length(btrim(\"Reason\")) > 0");
                t.HasCheckConstraint("CK_work_correction_sequence", "\"Sequence\" > 0");
            });
            b.HasKey(x => x.Id); b.HasIndex(x => new { x.UserId, x.SessionId, x.Sequence }).IsUnique();
            b.Property(x => x.Reason).HasMaxLength(2000); b.Property(x => x.Kind).HasMaxLength(30);
            b.Property(x => x.PreviousValues).HasColumnType("jsonb"); b.Property(x => x.NewValues).HasColumnType("jsonb");
            b.Property(x => x.PreviousSession).HasColumnType("jsonb"); b.Property(x => x.NewSession).HasColumnType("jsonb");
            b.HasOne<WorkSessionSegment>().WithMany().HasForeignKey(x => new { x.UserId, x.SessionId, x.SegmentId }).HasPrincipalKey(x => new { x.UserId, x.SessionId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        });
    }
}
