using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddWorkCorrections : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RecordedAt",
                table: "work_sessions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.Sql("""
                UPDATE work_sessions SET "RecordedAt" = "StartedAt";
                ALTER TABLE work_sessions ALTER COLUMN "RecordedAt" DROP DEFAULT;
                """);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_work_session_segments_UserId_SessionId_Id",
                table: "work_session_segments",
                columns: new[] { "UserId", "SessionId", "Id" });

            migrationBuilder.CreateTable(
                name: "work_session_corrections",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SegmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PreviousValues = table.Column<string>(type: "jsonb", nullable: true),
                    NewValues = table.Column<string>(type: "jsonb", nullable: false),
                    PreviousSession = table.Column<string>(type: "jsonb", nullable: true),
                    NewSession = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_session_corrections", x => x.Id);
                    table.CheckConstraint("CK_work_correction_reason", "length(btrim(\"Reason\")) > 0");
                    table.CheckConstraint("CK_work_correction_sequence", "\"Sequence\" > 0");
                    table.ForeignKey(
                        name: "FK_work_session_corrections_work_session_segments_UserId_Sessi~",
                        columns: x => new { x.UserId, x.SessionId, x.SegmentId },
                        principalTable: "work_session_segments",
                        principalColumns: new[] { "UserId", "SessionId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_work_session_corrections_UserId_SessionId_SegmentId",
                table: "work_session_corrections",
                columns: new[] { "UserId", "SessionId", "SegmentId" });

            migrationBuilder.CreateIndex(
                name: "IX_work_session_corrections_UserId_SessionId_Sequence",
                table: "work_session_corrections",
                columns: new[] { "UserId", "SessionId", "Sequence" },
                unique: true);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "work_session_corrections");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_work_session_segments_UserId_SessionId_Id",
                table: "work_session_segments");

            migrationBuilder.DropColumn(
                name: "RecordedAt",
                table: "work_sessions");
        }
    }
}
