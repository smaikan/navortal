using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddTaskHierarchy : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasDirectWork",
                table: "tasks",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentTaskId",
                table: "tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SortOrder",
                table: "tasks",
                type: "numeric(28,8)",
                precision: 28,
                scale: 8,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<long>(
                name: "TargetBudgetSeconds",
                table: "tasks",
                type: "bigint",
                nullable: true);

            // Eski kök görevler aynı işi görsün ve aynı sırada kalsın
            migrationBuilder.Sql("""
                WITH positions AS (
                    SELECT "Id", row_number() OVER (PARTITION BY "UserId" ORDER BY "CreatedAt", "Id") * 1024 AS position
                    FROM tasks
                ) UPDATE tasks t SET "SortOrder" = p.position FROM positions p WHERE t."Id" = p."Id";
                """);

            migrationBuilder.CreateIndex(
                name: "IX_tasks_UserId_ParentTaskId_SortOrder_Id",
                table: "tasks",
                columns: new[] { "UserId", "ParentTaskId", "SortOrder", "Id" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_budget",
                table: "tasks",
                sql: "\"TargetBudgetSeconds\" IS NULL OR \"TargetBudgetSeconds\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_direct",
                table: "tasks",
                sql: "\"HasDirectWork\" OR \"DirectEstimatedSeconds\" IS NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_parent",
                table: "tasks",
                sql: "\"ParentTaskId\" IS NULL OR \"ParentTaskId\" <> \"Id\"");

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_tasks_UserId_ParentTaskId",
                table: "tasks",
                columns: new[] { "UserId", "ParentTaskId" },
                principalTable: "tasks",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tasks_tasks_UserId_ParentTaskId",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_UserId_ParentTaskId_SortOrder_Id",
                table: "tasks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_budget",
                table: "tasks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_direct",
                table: "tasks");

            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_parent",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "HasDirectWork",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "ParentTaskId",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "TargetBudgetSeconds",
                table: "tasks");
        }
    }
}
