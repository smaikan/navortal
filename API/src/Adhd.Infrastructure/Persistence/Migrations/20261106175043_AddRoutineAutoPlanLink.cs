using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddRoutineAutoPlanLink : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "RecurrenceOccurrenceId",
                table: "day_items",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SeriesRetractedAt",
                table: "day_items",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_recurrence_occurrences_UserId_Id",
                table: "recurrence_occurrences",
                columns: new[] { "UserId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_day_items_UserId_RecurrenceOccurrenceId",
                table: "day_items",
                columns: new[] { "UserId", "RecurrenceOccurrenceId" },
                filter: "\"RecurrenceOccurrenceId\" IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_day_items_recurrence_occurrences_UserId_RecurrenceOccurrenc~",
                table: "day_items",
                columns: new[] { "UserId", "RecurrenceOccurrenceId" },
                principalTable: "recurrence_occurrences",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);

            // Sistemin eklediklerini revizyondan bul. Revizyonu yoksa kullanıcı öğesi sayıp olduğu gibi bırak.
            migrationBuilder.Sql("""
                UPDATE day_items d SET "RecurrenceOccurrenceId"=o."Id"
                FROM plan_revision_changes c
                JOIN recurrence_occurrences o ON o."UserId"=c."UserId"
                WHERE c."UserId"=d."UserId" AND c."DayItemId"=d."Id" AND c."Type"='RecurrenceAdded'
                    AND o."TaskId"=d."TaskId";
                """);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_day_items_recurrence_occurrences_UserId_RecurrenceOccurrenc~",
                table: "day_items");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_recurrence_occurrences_UserId_Id",
                table: "recurrence_occurrences");

            migrationBuilder.DropIndex(
                name: "IX_day_items_UserId_RecurrenceOccurrenceId",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "RecurrenceOccurrenceId",
                table: "day_items");

            migrationBuilder.DropColumn(
                name: "SeriesRetractedAt",
                table: "day_items");
        }
    }
}
