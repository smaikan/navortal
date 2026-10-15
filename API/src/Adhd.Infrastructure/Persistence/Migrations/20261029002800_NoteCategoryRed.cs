using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class NoteCategoryRed : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Amber ve Orange kategorilerini kırmızıya çevir. Varsayılan Uyarı da dahil.
            migrationBuilder.DropCheckConstraint(
                name: "CK_note_category_enums",
                table: "note_categories");

            migrationBuilder.Sql("UPDATE note_categories SET \"Color\" = 'Red' WHERE \"Color\" IN ('Amber','Orange');");

            migrationBuilder.AddCheckConstraint(
                name: "CK_note_category_enums",
                table: "note_categories",
                sql: "\"Color\" IN ('Gray','Blue','Teal','Green','Red','Pink','Purple') AND \"ViewMode\" IN ('Cards','List')");
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_note_category_enums",
                table: "note_categories");

            migrationBuilder.Sql("UPDATE note_categories SET \"Color\" = 'Amber' WHERE \"Color\" = 'Red';");

            migrationBuilder.AddCheckConstraint(
                name: "CK_note_category_enums",
                table: "note_categories",
                sql: "\"Color\" IN ('Gray','Blue','Teal','Green','Amber','Orange','Pink','Purple') AND \"ViewMode\" IN ('Cards','List')");
        }
    }
}
