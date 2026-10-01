using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddSupportTools : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EnergyDemand",
                table: "tasks",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "support_days",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AvailableEnergy = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_support_days", x => new { x.UserId, x.LocalDate });
                    table.CheckConstraint("CK_support_day_version", "\"Version\">0");
                    table.ForeignKey(
                        name: "FK_support_days_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "user_notes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    WorkSessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Text = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: true),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    ConvertedTaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConversionHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_notes", x => x.Id);
                    table.CheckConstraint("CK_note_conversion", "(\"ConvertedTaskId\" IS NULL)=(\"ConversionHash\" IS NULL)");
                    table.CheckConstraint("CK_note_kind", "\"Kind\" IN ('Task','Distraction','NextStep','Daily') AND (\"Kind\" NOT IN ('Task','NextStep') OR \"TaskId\" IS NOT NULL) AND ((\"Kind\"='Daily')=(\"LocalDate\" IS NOT NULL))");
                    table.CheckConstraint("CK_note_text", "length(btrim(\"Text\"))>0 AND \"Version\">0");
                    table.ForeignKey(
                        name: "FK_user_notes_tasks_UserId_ConvertedTaskId",
                        columns: x => new { x.UserId, x.ConvertedTaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_notes_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_notes_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_user_notes_work_sessions_UserId_WorkSessionId",
                        columns: x => new { x.UserId, x.WorkSessionId },
                        principalTable: "work_sessions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "daily_critical_tasks",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    Slot = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_daily_critical_tasks", x => new { x.UserId, x.LocalDate, x.TaskId });
                    table.CheckConstraint("CK_critical_slot", "\"Slot\" BETWEEN 1 AND 3");
                    table.ForeignKey(
                        name: "FK_daily_critical_tasks_support_days_UserId_LocalDate",
                        columns: x => new { x.UserId, x.LocalDate },
                        principalTable: "support_days",
                        principalColumns: new[] { "UserId", "LocalDate" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_daily_critical_tasks_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_daily_critical_tasks_UserId_LocalDate_Slot",
                table: "daily_critical_tasks",
                columns: new[] { "UserId", "LocalDate", "Slot" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_daily_critical_tasks_UserId_TaskId",
                table: "daily_critical_tasks",
                columns: new[] { "UserId", "TaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_ConvertedTaskId",
                table: "user_notes",
                columns: new[] { "UserId", "ConvertedTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_CreatedAt_Id",
                table: "user_notes",
                columns: new[] { "UserId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_LocalDate_Id",
                table: "user_notes",
                columns: new[] { "UserId", "LocalDate", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_TaskId_UpdatedAt_Id",
                table: "user_notes",
                columns: new[] { "UserId", "TaskId", "UpdatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_WorkSessionId",
                table: "user_notes",
                columns: new[] { "UserId", "WorkSessionId" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "daily_critical_tasks");

            migrationBuilder.DropTable(
                name: "user_notes");

            migrationBuilder.DropTable(
                name: "support_days");

            migrationBuilder.DropColumn(
                name: "EnergyDemand",
                table: "tasks");
        }
    }
}
