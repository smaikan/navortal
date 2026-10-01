using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddPlanUndo : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ReversesChangeSetId",
                table: "scheduling_proposals",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReversesChangeSetId",
                table: "plan_revisions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_scheduling_proposals_UserId_ReversesChangeSetId",
                table: "scheduling_proposals",
                columns: new[] { "UserId", "ReversesChangeSetId" },
                unique: true,
                filter: "\"Status\" = 'Applied' AND \"ReversesChangeSetId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_plan_revisions_UserId_ReversesChangeSetId",
                table: "plan_revisions",
                columns: new[] { "UserId", "ReversesChangeSetId" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_scheduling_proposals_UserId_ReversesChangeSetId",
                table: "scheduling_proposals");

            migrationBuilder.DropIndex(
                name: "IX_plan_revisions_UserId_ReversesChangeSetId",
                table: "plan_revisions");

            migrationBuilder.DropColumn(
                name: "ReversesChangeSetId",
                table: "scheduling_proposals");

            migrationBuilder.DropColumn(
                name: "ReversesChangeSetId",
                table: "plan_revisions");
        }
    }
}
