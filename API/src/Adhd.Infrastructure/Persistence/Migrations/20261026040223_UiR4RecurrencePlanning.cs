using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class UiR4RecurrencePlanning : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TimingIssue",
                table: "day_items",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TimingIssue",
                table: "day_items");
        }
    }
}
