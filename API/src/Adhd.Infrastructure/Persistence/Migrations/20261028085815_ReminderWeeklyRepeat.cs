using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class ReminderWeeklyRepeat : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<System.DateTimeOffset>(name: "NextDueAt", table: "custom_reminders", type: "timestamp with time zone", nullable: true);
            migrationBuilder.AddColumn<string>(
                name: "RepeatSettings",
                table: "custom_reminders",
                type: "jsonb",
                nullable: true);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "NextDueAt", table: "custom_reminders");
            migrationBuilder.DropColumn(
                name: "RepeatSettings",
                table: "custom_reminders");
        }
    }
}
