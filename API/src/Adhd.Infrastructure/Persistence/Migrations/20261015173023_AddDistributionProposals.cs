using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddDistributionProposals : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "scheduling_proposals",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Day");

            migrationBuilder.AddCheckConstraint(
                name: "CK_proposal_kind",
                table: "scheduling_proposals",
                sql: "\"Kind\" IN ('Day','Distribution')");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_proposal_kind",
                table: "scheduling_proposals");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "scheduling_proposals");
        }
    }
}
