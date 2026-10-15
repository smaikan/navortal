using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR2TaskDeleteAutoComplete : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Var olan üst görevlerin otomatik bitirme ayarı aynı kalsın
            migrationBuilder.AddColumn<bool>(
                name: "AutoCompleteFromChildren",
                table: "tasks",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeletedAt",
                table: "tasks",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_deleted",
                table: "tasks",
                sql: "\"DeletedAt\" IS NULL OR \"ArchivedAt\" IS NOT NULL");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_deleted",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "AutoCompleteFromChildren",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "tasks");
        }
    }
}
