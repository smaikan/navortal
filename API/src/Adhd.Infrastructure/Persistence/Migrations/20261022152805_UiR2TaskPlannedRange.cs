using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR2TaskPlannedRange : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "PlannedFrom",
                table: "tasks",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "PlannedTo",
                table: "tasks",
                type: "date",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_tasks_planned_range",
                table: "tasks",
                sql: "(\"PlannedFrom\" IS NULL AND \"PlannedTo\" IS NULL) OR (\"PlannedFrom\" IS NOT NULL AND \"PlannedTo\" IS NOT NULL AND \"PlannedFrom\" <= \"PlannedTo\")");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_tasks_planned_range",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "PlannedFrom",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "PlannedTo",
                table: "tasks");
        }
    }
}
