using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR3SessionsHistorySpecialDays : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "ScheduleId",
                table: "plan_revision_changes",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<Guid>(
                name: "DayItemId",
                table: "plan_revision_changes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ScheduleId",
                table: "day_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "auth_session_cutoffs",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ValidAfter = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_session_cutoffs", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_auth_session_cutoffs_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "auth_sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UserAgentFamily = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AdoptedTokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_auth_sessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_auth_sessions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "client_error_reports",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Route = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BuildId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    BrowserFamily = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_client_error_reports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_client_error_reports_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "plan_revision_day_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    DayItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_revision_day_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_plan_revision_day_items_day_items_UserId_DayItemId",
                        columns: x => new { x.UserId, x.DayItemId },
                        principalTable: "day_items",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_plan_revision_day_items_plan_revisions_UserId_RevisionId",
                        columns: x => new { x.UserId, x.RevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "special_days",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Month = table.Column<int>(type: "integer", nullable: false),
                    Day = table.Column<int>(type: "integer", nullable: false),
                    Year = table.Column<int>(type: "integer", nullable: true),
                    Recurrence = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    NonWorking = table.Column<bool>(type: "boolean", nullable: false),
                    Reminder = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_special_days", x => x.Id);
                    table.CheckConstraint("CK_special_day_day", "\"Day\" BETWEEN 1 AND 31");
                    table.CheckConstraint("CK_special_day_month", "\"Month\" BETWEEN 1 AND 12");
                    table.CheckConstraint("CK_special_day_once_year", "\"Recurrence\" <> 'Once' OR \"Year\" IS NOT NULL");
                    table.CheckConstraint("CK_special_day_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_special_days_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_changes_UserId_DayItemId",
                table: "plan_revision_changes",
                columns: new[] { "UserId", "DayItemId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_revision_change_target",
                table: "plan_revision_changes",
                sql: "(\"ScheduleId\" IS NULL) <> (\"DayItemId\" IS NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_auth_sessions_AdoptedTokenHash",
                table: "auth_sessions",
                column: "AdoptedTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_auth_sessions_UserId_RevokedAt",
                table: "auth_sessions",
                columns: new[] { "UserId", "RevokedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_client_error_reports_ReceivedAt",
                table: "client_error_reports",
                column: "ReceivedAt");

            migrationBuilder.CreateIndex(
                name: "IX_client_error_reports_UserId_ReceivedAt",
                table: "client_error_reports",
                columns: new[] { "UserId", "ReceivedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_day_items_UserId_DayItemId",
                table: "plan_revision_day_items",
                columns: new[] { "UserId", "DayItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_day_items_UserId_RevisionId_DayItemId",
                table: "plan_revision_day_items",
                columns: new[] { "UserId", "RevisionId", "DayItemId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_special_days_UserId_DeletedAt_Month_Day",
                table: "special_days",
                columns: new[] { "UserId", "DeletedAt", "Month", "Day" });

            migrationBuilder.AddForeignKey(
                name: "FK_plan_revision_changes_day_items_UserId_DayItemId",
                table: "plan_revision_changes",
                columns: new[] { "UserId", "DayItemId" },
                principalTable: "day_items",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_plan_revision_changes_day_items_UserId_DayItemId",
                table: "plan_revision_changes");

            migrationBuilder.DropTable(
                name: "auth_session_cutoffs");

            migrationBuilder.DropTable(
                name: "auth_sessions");

            migrationBuilder.DropTable(
                name: "client_error_reports");

            migrationBuilder.DropTable(
                name: "plan_revision_day_items");

            migrationBuilder.DropTable(
                name: "special_days");

            migrationBuilder.DropIndex(
                name: "IX_plan_revision_changes_UserId_DayItemId",
                table: "plan_revision_changes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_revision_change_target",
                table: "plan_revision_changes");

            migrationBuilder.DropColumn(
                name: "DayItemId",
                table: "plan_revision_changes");

            migrationBuilder.DropColumn(
                name: "ScheduleId",
                table: "day_items");

            migrationBuilder.AlterColumn<Guid>(
                name: "ScheduleId",
                table: "plan_revision_changes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
