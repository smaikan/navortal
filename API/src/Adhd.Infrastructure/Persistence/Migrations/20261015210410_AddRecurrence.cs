using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddRecurrence : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "recurrence_templates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurrence_templates", x => x.Id);
                    table.UniqueConstraint("AK_recurrence_templates_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_recurrence_version", "\"Version\">0");
                    table.ForeignKey(
                        name: "FK_recurrence_templates_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "recurrence_definitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false),
                    EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                    Rule = table.Column<string>(type: "jsonb", nullable: false),
                    TaskDefaults = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurrence_definitions", x => x.Id);
                    table.UniqueConstraint("AK_recurrence_definitions_UserId_TemplateId_Id", x => new { x.UserId, x.TemplateId, x.Id });
                    table.CheckConstraint("CK_recurrence_definition_number", "\"Number\">0");
                    table.ForeignKey(
                        name: "FK_recurrence_definitions_recurrence_templates_UserId_Template~",
                        columns: x => new { x.UserId, x.TemplateId },
                        principalTable: "recurrence_templates",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "recurrence_occurrences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppliedDefinitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    DueTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    TimeAdjusted = table.Column<bool>(type: "boolean", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    SyncedTaskVersion = table.Column<long>(type: "bigint", nullable: true),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_recurrence_occurrences", x => x.Id);
                    table.CheckConstraint("CK_occurrence_state", "\"State\" IN ('Materialized','Skipped','Canceled') AND (\"State\"<>'Materialized' OR \"TaskId\" IS NOT NULL)");
                    table.CheckConstraint("CK_occurrence_task_version", "(\"TaskId\" IS NULL)=(\"SyncedTaskVersion\" IS NULL) AND (\"SyncedTaskVersion\" IS NULL OR \"SyncedTaskVersion\">0)");
                    table.ForeignKey(
                        name: "FK_recurrence_occurrences_recurrence_definitions_UserId_Templa~",
                        columns: x => new { x.UserId, x.TemplateId, x.AppliedDefinitionId },
                        principalTable: "recurrence_definitions",
                        principalColumns: new[] { "UserId", "TemplateId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_recurrence_occurrences_recurrence_definitions_UserId_Templ~1",
                        columns: x => new { x.UserId, x.TemplateId, x.DefinitionId },
                        principalTable: "recurrence_definitions",
                        principalColumns: new[] { "UserId", "TemplateId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_recurrence_occurrences_recurrence_templates_UserId_Template~",
                        columns: x => new { x.UserId, x.TemplateId },
                        principalTable: "recurrence_templates",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_recurrence_occurrences_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_definitions_UserId_TemplateId_Number",
                table: "recurrence_definitions",
                columns: new[] { "UserId", "TemplateId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_occurrences_UserId_TaskId",
                table: "recurrence_occurrences",
                columns: new[] { "UserId", "TaskId" },
                unique: true,
                filter: "\"TaskId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_occurrences_UserId_TemplateId_AppliedDefinitionId",
                table: "recurrence_occurrences",
                columns: new[] { "UserId", "TemplateId", "AppliedDefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_occurrences_UserId_TemplateId_DefinitionId",
                table: "recurrence_occurrences",
                columns: new[] { "UserId", "TemplateId", "DefinitionId" });

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_occurrences_UserId_TemplateId_LocalDate",
                table: "recurrence_occurrences",
                columns: new[] { "UserId", "TemplateId", "LocalDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_recurrence_templates_UserId_CreatedAt_Id",
                table: "recurrence_templates",
                columns: new[] { "UserId", "CreatedAt", "Id" });
            migrationBuilder.Sql("""
                CREATE FUNCTION protect_recurrence_definition() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN RAISE EXCEPTION 'recurrence definition history is immutable'; END $$;
                CREATE TRIGGER protect_recurrence_definition BEFORE UPDATE OR DELETE ON recurrence_definitions
                    FOR EACH ROW EXECUTE FUNCTION protect_recurrence_definition();
                CREATE FUNCTION protect_recurrence_identity() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                    IF (NEW."UserId",NEW."TemplateId",NEW."DefinitionId",NEW."LocalDate",NEW."TimeZoneId",NEW."DueTime",NEW."DueAt",NEW."TimeAdjusted",NEW."TaskId",NEW."CreatedAt")
                        IS DISTINCT FROM (OLD."UserId",OLD."TemplateId",OLD."DefinitionId",OLD."LocalDate",OLD."TimeZoneId",OLD."DueTime",OLD."DueAt",OLD."TimeAdjusted",OLD."TaskId",OLD."CreatedAt") THEN
                        RAISE EXCEPTION 'recurrence occurrence identity is immutable';
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER protect_recurrence_identity BEFORE UPDATE ON recurrence_occurrences
                    FOR EACH ROW EXECUTE FUNCTION protect_recurrence_identity();
                """);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER protect_recurrence_identity ON recurrence_occurrences; DROP FUNCTION protect_recurrence_identity(); DROP TRIGGER protect_recurrence_definition ON recurrence_definitions; DROP FUNCTION protect_recurrence_definition();");
            migrationBuilder.DropTable(
                name: "recurrence_occurrences");

            migrationBuilder.DropTable(
                name: "recurrence_definitions");

            migrationBuilder.DropTable(
                name: "recurrence_templates");
        }
    }
}
