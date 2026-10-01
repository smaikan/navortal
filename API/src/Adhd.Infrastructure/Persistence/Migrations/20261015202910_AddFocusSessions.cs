using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddFocusSessions : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "focus_presets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Settings = table.Column<string>(type: "jsonb", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_focus_presets", x => x.Id);
                    table.UniqueConstraint("AK_focus_presets_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_focus_preset_version", "\"Version\">0");
                    table.ForeignKey(
                        name: "FK_focus_presets_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "focus_sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    PreviousFocusId = table.Column<Guid>(type: "uuid", nullable: true),
                    PresetId = table.Column<Guid>(type: "uuid", nullable: true),
                    PresetName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PresetVersion = table.Column<long>(type: "bigint", nullable: true),
                    Settings = table.Column<string>(type: "jsonb", nullable: false),
                    CycleNumber = table.Column<int>(type: "integer", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    WorkEndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    BreakStartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    BreakEndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TargetReachedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TargetObservedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_focus_sessions", x => x.Id);
                    table.UniqueConstraint("AK_focus_sessions_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_focus_state", "\"State\" IN ('Working','Paused','Break','AwaitingNext','Finished','Interrupted')");
                    table.CheckConstraint("CK_focus_target", "(\"TargetReachedAt\" IS NULL) = (\"TargetObservedAt\" IS NULL)");
                    table.CheckConstraint("CK_focus_terminal", "(\"State\" IN ('Finished','Interrupted')) = (\"EndedAt\" IS NOT NULL)");
                    table.CheckConstraint("CK_focus_time", "(\"WorkEndedAt\" IS NULL OR \"WorkEndedAt\">=\"StartedAt\") AND (\"BreakStartedAt\" IS NULL OR \"BreakStartedAt\">=\"WorkEndedAt\") AND (\"BreakEndedAt\" IS NULL OR \"BreakEndedAt\">=\"BreakStartedAt\") AND (\"EndedAt\" IS NULL OR \"EndedAt\">=\"StartedAt\")");
                    table.CheckConstraint("CK_focus_version", "\"Version\">0 AND \"CycleNumber\">0");
                    table.ForeignKey(
                        name: "FK_focus_sessions_focus_presets_UserId_PresetId",
                        columns: x => new { x.UserId, x.PresetId },
                        principalTable: "focus_presets",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_focus_sessions_focus_sessions_UserId_PreviousFocusId",
                        columns: x => new { x.UserId, x.PreviousFocusId },
                        principalTable: "focus_sessions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_focus_sessions_work_sessions_UserId_WorkSessionId",
                        columns: x => new { x.UserId, x.WorkSessionId },
                        principalTable: "work_sessions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_focus_presets_UserId_Name_Id",
                table: "focus_presets",
                columns: new[] { "UserId", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_focus_sessions_UserId",
                table: "focus_sessions",
                column: "UserId",
                unique: true,
                filter: "\"State\" NOT IN ('Finished','Interrupted')");

            migrationBuilder.CreateIndex(
                name: "IX_focus_sessions_UserId_PresetId",
                table: "focus_sessions",
                columns: new[] { "UserId", "PresetId" });

            migrationBuilder.CreateIndex(
                name: "IX_focus_sessions_UserId_PreviousFocusId",
                table: "focus_sessions",
                columns: new[] { "UserId", "PreviousFocusId" },
                unique: true,
                filter: "\"PreviousFocusId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_focus_sessions_UserId_StartedAt_Id",
                table: "focus_sessions",
                columns: new[] { "UserId", "StartedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_focus_sessions_UserId_WorkSessionId",
                table: "focus_sessions",
                columns: new[] { "UserId", "WorkSessionId" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "focus_sessions");

            migrationBuilder.DropTable(
                name: "focus_presets");
        }
    }
}
