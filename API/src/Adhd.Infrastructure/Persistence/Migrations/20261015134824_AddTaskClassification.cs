using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddTaskClassification : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PoolId",
                table: "tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProjectId",
                table: "tasks",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "task_tag_links",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_tag_links", x => new { x.UserId, x.TaskId, x.TagId });
                    table.ForeignKey(
                        name: "FK_task_tag_links_task_tags_UserId_TagId",
                        columns: x => new { x.UserId, x.TagId },
                        principalTable: "task_tags",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_tag_links_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tasks_UserId_CategoryId",
                table: "tasks",
                columns: new[] { "UserId", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_tasks_UserId_PoolId",
                table: "tasks",
                columns: new[] { "UserId", "PoolId" });

            migrationBuilder.CreateIndex(
                name: "IX_tasks_UserId_ProjectId",
                table: "tasks",
                columns: new[] { "UserId", "ProjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_tag_links_UserId_TagId_TaskId",
                table: "task_tag_links",
                columns: new[] { "UserId", "TagId", "TaskId" });

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_task_categories_UserId_CategoryId",
                table: "tasks",
                columns: new[] { "UserId", "CategoryId" },
                principalTable: "task_categories",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_task_pools_UserId_PoolId",
                table: "tasks",
                columns: new[] { "UserId", "PoolId" },
                principalTable: "task_pools",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_task_projects_UserId_ProjectId",
                table: "tasks",
                columns: new[] { "UserId", "ProjectId" },
                principalTable: "task_projects",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tasks_task_categories_UserId_CategoryId",
                table: "tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_tasks_task_pools_UserId_PoolId",
                table: "tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_tasks_task_projects_UserId_ProjectId",
                table: "tasks");

            migrationBuilder.DropTable(
                name: "task_tag_links");

            migrationBuilder.DropIndex(
                name: "IX_tasks_UserId_CategoryId",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_UserId_PoolId",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_UserId_ProjectId",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "PoolId",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "ProjectId",
                table: "tasks");
        }
    }
}
