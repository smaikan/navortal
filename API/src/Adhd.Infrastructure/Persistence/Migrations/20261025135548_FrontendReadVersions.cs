using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class FrontendReadVersions : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "NotesVersion",
                table: "user_planning_states",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "SpecialDaysVersion",
                table: "user_planning_states",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "NotesVersion",
                table: "user_planning_states");

            migrationBuilder.DropColumn(
                name: "SpecialDaysVersion",
                table: "user_planning_states");
        }
    }
}
