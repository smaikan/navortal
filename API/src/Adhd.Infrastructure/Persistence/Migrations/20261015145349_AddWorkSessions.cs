using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddWorkSessions : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True")
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,")
                .OldAnnotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True");

            migrationBuilder.CreateTable(
                name: "idempotency_records",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Scope = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Response = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_idempotency_records", x => new { x.UserId, x.Scope, x.Key });
                    table.ForeignKey(
                        name: "FK_idempotency_records_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "work_sessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Source = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TaskSnapshot = table.Column<string>(type: "jsonb", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_sessions", x => x.Id);
                    table.UniqueConstraint("AK_work_sessions_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_work_state", "(\"State\" IN ('Running','Paused') AND \"EndedAt\" IS NULL) OR (\"State\" IN ('Finished','Canceled') AND \"EndedAt\" IS NOT NULL)");
                    table.CheckConstraint("CK_work_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");
                    table.CheckConstraint("CK_work_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_work_sessions_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_work_sessions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "work_session_segments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    IsVoided = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_session_segments", x => x.Id);
                    table.CheckConstraint("CK_segment_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");
                    table.CheckConstraint("CK_segment_version", "\"Version\" > 0");
                    table.CheckConstraint("CK_segment_void", "NOT \"IsVoided\" OR \"EndedAt\" IS NOT NULL");
                    table.ForeignKey(
                        name: "FK_work_session_segments_work_sessions_UserId_SessionId",
                        columns: x => new { x.UserId, x.SessionId },
                        principalTable: "work_sessions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_work_session_segments_UserId",
                table: "work_session_segments",
                column: "UserId",
                unique: true,
                filter: "\"EndedAt\" IS NULL AND NOT \"IsVoided\"");

            migrationBuilder.CreateIndex(
                name: "IX_work_session_segments_UserId_SessionId_StartedAt",
                table: "work_session_segments",
                columns: new[] { "UserId", "SessionId", "StartedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_work_sessions_UserId",
                table: "work_sessions",
                column: "UserId",
                unique: true,
                filter: "\"State\" = 'Running'");

            migrationBuilder.CreateIndex(
                name: "IX_work_sessions_UserId_StartedAt_Id",
                table: "work_sessions",
                columns: new[] { "UserId", "StartedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_work_sessions_UserId_TaskId",
                table: "work_sessions",
                columns: new[] { "UserId", "TaskId" },
                unique: true,
                filter: "\"State\" IN ('Running','Paused') AND \"TaskId\" IS NOT NULL");
            migrationBuilder.Sql("""
                ALTER TABLE work_session_segments ADD CONSTRAINT "EX_work_segments_user_time"
                EXCLUDE USING gist ("UserId" WITH =, tstzrange("StartedAt", "EndedAt", '[)') WITH &&)
                WHERE (NOT "IsVoided");
                """);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "idempotency_records");

            migrationBuilder.DropTable(
                name: "work_session_segments");

            migrationBuilder.DropTable(
                name: "work_sessions");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True")
                .OldAnnotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True")
                .OldAnnotation("Npgsql:PostgresExtension:btree_gist", ",,");
        }
    }
}
