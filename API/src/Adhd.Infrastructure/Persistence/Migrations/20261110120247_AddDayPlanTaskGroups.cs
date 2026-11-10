using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddDayPlanTaskGroups : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupParentTaskId",
                table: "day_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "GroupTaskId",
                table: "day_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_GroupTaskId",
                table: "day_items",
                columns: new[] { "UserId", "GroupTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_LocalDate_GroupTaskId",
                table: "day_items",
                columns: new[] { "UserId", "LocalDate", "GroupTaskId" });

            migrationBuilder.AddForeignKey(
                name: "FK_day_items_tasks_UserId_GroupTaskId",
                table: "day_items",
                columns: new[] { "UserId", "GroupTaskId" },
                principalTable: "tasks",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_day_items_tasks_UserId_GroupTaskId",
                table: "day_items");

            migrationBuilder.DropIndex(
                name: "IX_day_items_UserId_GroupTaskId",
                table: "day_items");

            migrationBuilder.DropIndex(
                name: "IX_day_items_UserId_LocalDate_GroupTaskId",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "GroupParentTaskId",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "GroupTaskId",
                table: "day_items");
        }
    }
}
