using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class DefineTurkishSearchCollation : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True");

            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "tasks",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                collation: "adhd_search",
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_tags",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                collation: "adhd_search",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_projects",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                collation: "adhd_search",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_pools",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                collation: "adhd_search",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_categories",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                collation: "adhd_search",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Title",
                table: "tasks",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(300)",
                oldMaxLength: 300,
                oldCollation: "adhd_search");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_tags",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldCollation: "adhd_search");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_projects",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldCollation: "adhd_search");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_pools",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldCollation: "adhd_search");

            migrationBuilder.AlterColumn<string>(
                name: "Name",
                table: "task_categories",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldCollation: "adhd_search");

            // Collation silinmeden önce kolon ve indeks bağlantılarını kaldır.
            migrationBuilder.AlterDatabase()
                .OldAnnotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True");
        }
    }
}
