using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddEisenhowerMatrix : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "matrix_items",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quadrant = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_matrix_items", x => new { x.UserId, x.TaskId });
                    table.CheckConstraint("CK_matrix_quadrant", "\"Quadrant\" IN ('Inbox','Do','Schedule','Delegate','Eliminate')");
                    table.ForeignKey(
                        name: "FK_matrix_items_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "matrix_states",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_matrix_states", x => x.UserId);
                    table.CheckConstraint("CK_matrix_version", "\"Version\" >= 0");
                    table.ForeignKey(
                        name: "FK_matrix_states_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_matrix_items_UserId_Quadrant_SortOrder_TaskId",
                table: "matrix_items",
                columns: new[] { "UserId", "Quadrant", "SortOrder", "TaskId" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "matrix_items");

            migrationBuilder.DropTable(
                name: "matrix_states");
        }
    }
}
