using Adhd.Domain.Users;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed class SchedulingProposalRecord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateOnly LocalDate { get; set; }
    public long InputPlanningVersion { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public string InputHash { get; set; } = "";
    public string Input { get; set; } = "{}";
    public string PublicResult { get; set; } = "{}";
    public string Status { get; set; } = "Pending";
    public string Kind { get; set; } = "Day";
    public Guid? AppliedChangeSetId { get; set; }
    public Guid? ReversesChangeSetId { get; set; }
    public string? AppliedResult { get; set; }
}
internal static class SchedulingPersistence
{
    internal static void Configure(ModelBuilder model) => model.Entity<SchedulingProposalRecord>(b =>
    {
        b.ToTable("scheduling_proposals", t =>
        {
            t.HasCheckConstraint("CK_proposal_status", "\"Status\" IN ('Pending','Applied','Expired')");
            t.HasCheckConstraint("CK_proposal_expiry", "\"CreatedAt\" < \"ExpiresAt\"");
            t.HasCheckConstraint("CK_proposal_version", "\"InputPlanningVersion\" >= 0");
            t.HasCheckConstraint("CK_proposal_kind", "\"Kind\" IN ('Day','Distribution')");
        });
        b.HasKey(x => x.Id); b.Property(x => x.InputHash).HasMaxLength(64); b.Property(x => x.Status).HasMaxLength(20);
        b.Property(x => x.Kind).HasMaxLength(20).HasDefaultValue("Day");
        b.Property(x => x.Input).HasColumnType("jsonb"); b.Property(x => x.PublicResult).HasColumnType("jsonb"); b.Property(x => x.AppliedResult).HasColumnType("jsonb");
        b.HasIndex(x => new { x.UserId, x.CreatedAt, x.Id }); b.HasIndex(x => new { x.Status, x.ExpiresAt });
        b.HasIndex(x => new { x.UserId, x.ReversesChangeSetId }).IsUnique().HasFilter("\"Status\" = 'Applied' AND \"ReversesChangeSetId\" IS NOT NULL");
        b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    });
}
