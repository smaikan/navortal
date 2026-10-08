using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR2DayItems : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CompletedAt",
                table: "task_schedules",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "day_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_day_items", x => x.Id);
                    table.UniqueConstraint("AK_day_items_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_day_item_sort", "\"SortOrder\" >= 0");
                    table.CheckConstraint("CK_day_item_state", "\"State\" IN ('Planned','Removed','Scheduled')");
                    table.CheckConstraint("CK_day_item_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_day_items_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_day_items_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_LocalDate_SortOrder",
                table: "day_items",
                columns: new[] { "UserId", "LocalDate", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_LocalDate_TaskId",
                table: "day_items",
                columns: new[] { "UserId", "LocalDate", "TaskId" },
                unique: true,
                filter: "\"State\" = 'Planned'");

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_TaskId",
                table: "day_items",
                columns: new[] { "UserId", "TaskId" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "day_items");

            migrationBuilder.DropColumn(
                name: "CompletedAt",
                table: "task_schedules");
        }
    }
}
