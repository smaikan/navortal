using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddTaskRelations : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "task_dependencies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PredecessorTaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    SuccessorTaskId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_dependencies", x => x.Id);
                    table.CheckConstraint("CK_dependency_self", "\"PredecessorTaskId\" <> \"SuccessorTaskId\"");
                    table.ForeignKey(
                        name: "FK_task_dependencies_tasks_UserId_PredecessorTaskId",
                        columns: x => new { x.UserId, x.PredecessorTaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_dependencies_tasks_UserId_SuccessorTaskId",
                        columns: x => new { x.UserId, x.SuccessorTaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_ordering_preferences",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BeforeTaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    AfterTaskId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_ordering_preferences", x => x.Id);
                    table.CheckConstraint("CK_ordering_self", "\"BeforeTaskId\" <> \"AfterTaskId\"");
                    table.ForeignKey(
                        name: "FK_task_ordering_preferences_tasks_UserId_AfterTaskId",
                        columns: x => new { x.UserId, x.AfterTaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_ordering_preferences_tasks_UserId_BeforeTaskId",
                        columns: x => new { x.UserId, x.BeforeTaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_task_dependencies_UserId_PredecessorTaskId_SuccessorTaskId",
                table: "task_dependencies",
                columns: new[] { "UserId", "PredecessorTaskId", "SuccessorTaskId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_dependencies_UserId_SuccessorTaskId",
                table: "task_dependencies",
                columns: new[] { "UserId", "SuccessorTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_ordering_preferences_UserId_AfterTaskId",
                table: "task_ordering_preferences",
                columns: new[] { "UserId", "AfterTaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_ordering_preferences_UserId_BeforeTaskId_AfterTaskId",
                table: "task_ordering_preferences",
                columns: new[] { "UserId", "BeforeTaskId", "AfterTaskId" },
                unique: true);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "task_dependencies");

            migrationBuilder.DropTable(
                name: "task_ordering_preferences");
        }
    }
}
