using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddTaskLifecycle : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CompletedAt",
                table: "tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompletionOrigin",
                table: "tasks",
                type: "character varying(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DirectWorkCompleted",
                table: "tasks",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RequiredForParent",
                table: "tasks",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<long>(
                name: "Sequence",
                table: "task_events",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            // Eski bitirme bilgilerini ve olayların kalıcı sırasını doldur
            migrationBuilder.Sql("""
                UPDATE tasks SET "CompletedAt" = "UpdatedAt", "CompletionOrigin" = 'Manual', "DirectWorkCompleted" = "HasDirectWork" WHERE "State" = 'Completed';
                WITH ordered AS (
                    SELECT "Id", row_number() OVER (PARTITION BY "UserId", "TaskId" ORDER BY COALESCE(("Payload"->'after'->>'Version')::bigint,0), "EffectiveAt", "Id") AS position
                    FROM task_events
                ) UPDATE task_events e SET "Sequence" = o.position FROM ordered o WHERE e."Id" = o."Id";
                UPDATE tasks t SET "Version" = greatest(t."Version", e.sequence)
                FROM (SELECT "UserId", "TaskId", max("Sequence") AS sequence FROM task_events GROUP BY "UserId", "TaskId") e
                WHERE t."UserId" = e."UserId" AND t."Id" = e."TaskId";
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_completion",
                table: "tasks",
                sql: "(\"State\" = 'Completed' AND \"CompletedAt\" IS NOT NULL AND \"CompletionOrigin\" IS NOT NULL) OR (\"State\" <> 'Completed' AND \"CompletedAt\" IS NULL AND \"CompletionOrigin\" IS NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_direct_completion",
                table: "tasks",
                sql: "NOT \"DirectWorkCompleted\" OR \"HasDirectWork\"");

            migrationBuilder.CreateIndex(
                name: "IX_task_events_UserId_TaskId_Sequence",
                table: "task_events",
                columns: new[] { "UserId", "TaskId", "Sequence" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_task_events_sequence",
                table: "task_events",
                sql: "\"Sequence\" > 0");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_completion",
                table: "tasks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_direct_completion",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_task_events_UserId_TaskId_Sequence",
                table: "task_events");

            migrationBuilder.DropCheckConstraint(
                name: "CK_task_events_sequence",
                table: "task_events");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "CompletionOrigin",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "DirectWorkCompleted",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "RequiredForParent",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "Sequence",
                table: "task_events");
        }
    }
}
