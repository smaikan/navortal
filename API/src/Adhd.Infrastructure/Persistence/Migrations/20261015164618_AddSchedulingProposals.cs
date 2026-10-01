using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddSchedulingProposals : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAutomatic",
                table: "task_schedules",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "scheduling_proposals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    InputPlanningVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    InputHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Input = table.Column<string>(type: "jsonb", nullable: false),
                    PublicResult = table.Column<string>(type: "jsonb", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AppliedChangeSetId = table.Column<Guid>(type: "uuid", nullable: true),
                    AppliedResult = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scheduling_proposals", x => x.Id);
                    table.CheckConstraint("CK_proposal_expiry", "\"CreatedAt\" < \"ExpiresAt\"");
                    table.CheckConstraint("CK_proposal_status", "\"Status\" IN ('Pending','Applied','Expired')");
                    table.CheckConstraint("CK_proposal_version", "\"InputPlanningVersion\" >= 0");
                    table.ForeignKey(
                        name: "FK_scheduling_proposals_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_scheduling_proposals_Status_ExpiresAt",
                table: "scheduling_proposals",
                columns: new[] { "Status", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_scheduling_proposals_UserId_CreatedAt_Id",
                table: "scheduling_proposals",
                columns: new[] { "UserId", "CreatedAt", "Id" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "scheduling_proposals");

            migrationBuilder.DropColumn(
                name: "IsAutomatic",
                table: "task_schedules");
        }
    }
}
