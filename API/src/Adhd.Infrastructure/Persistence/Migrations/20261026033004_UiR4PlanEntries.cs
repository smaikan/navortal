using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR4PlanEntries : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndsAt",
                table: "day_items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsUrgent",
                table: "day_items",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartsAt",
                table: "day_items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_day_item_time",
                table: "day_items",
                sql: "\"EndsAt\" IS NULL OR (\"StartsAt\" IS NOT NULL AND \"StartsAt\" < \"EndsAt\")");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_day_item_time",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "EndsAt",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "IsUrgent",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "StartsAt",
                table: "day_items");
        }
    }
}
