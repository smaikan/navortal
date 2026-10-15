using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class NoteCategories : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_note_kind",
                table: "user_notes");

            migrationBuilder.AddColumn<string>(
                name: "NotesAllViewMode",
                table: "user_planning_states",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Cards");

            migrationBuilder.AddColumn<string>(
                name: "NotesTaskViewMode",
                table: "user_planning_states",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "List");

            migrationBuilder.AddColumn<Guid>(
                name: "CategoryId",
                table: "user_notes",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Display",
                table: "user_notes",
                type: "character varying(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "Short");

            migrationBuilder.AddColumn<string>(
                name: "Title",
                table: "user_notes",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "note_categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Color = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    SortOrder = table.Column<decimal>(type: "numeric(28,10)", precision: 28, scale: 10, nullable: false),
                    ShowInBar = table.Column<bool>(type: "boolean", nullable: false),
                    PinInAll = table.Column<bool>(type: "boolean", nullable: false),
                    ViewMode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RemovedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_note_categories", x => x.Id);
                    table.UniqueConstraint("AK_note_categories_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_note_category_enums", "\"Color\" IN ('Gray','Blue','Teal','Green','Amber','Orange','Pink','Purple') AND \"ViewMode\" IN ('Cards','List')");
                    table.CheckConstraint("CK_note_category_name", "length(btrim(\"Name\")) BETWEEN 1 AND 40 AND \"Version\">0");
                    table.ForeignKey(
                        name: "FK_note_categories_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            // Kategorisi olmayan mevcut hesaba Uyarı ekle. Varsa olduğu gibi bırak.
            migrationBuilder.Sql("""
                INSERT INTO note_categories ("Id","UserId","Name","Color","SortOrder","ShowInBar","PinInAll","ViewMode","CreatedAt","UpdatedAt","RemovedAt","Version")
                SELECT gen_random_uuid(), u."Id", 'Uyarı', 'Amber', 1024, TRUE, TRUE, 'Cards', now(), now(), NULL, 1
                FROM users u WHERE NOT EXISTS (SELECT 1 FROM note_categories c WHERE c."UserId" = u."Id");
                """);

            migrationBuilder.CreateIndex(
                name: "IX_user_notes_UserId_CategoryId_UpdatedAt_Id",
                table: "user_notes",
                columns: new[] { "UserId", "CategoryId", "UpdatedAt", "Id" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_note_display",
                table: "user_notes",
                sql: "\"Display\" IN ('Short','Detailed','Toggle') AND ((\"Display\"='Short')=(\"Title\" IS NULL)) AND (\"Title\" IS NULL OR length(btrim(\"Title\")) BETWEEN 1 AND 200)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_note_kind",
                table: "user_notes",
                sql: "\"Kind\" IN ('Task','Distraction','NextStep','Daily','General') AND (\"Kind\" NOT IN ('Task','NextStep') OR \"TaskId\" IS NOT NULL) AND ((\"Kind\"='Daily')=(\"LocalDate\" IS NOT NULL))");

            migrationBuilder.CreateIndex(
                name: "IX_note_categories_UserId_RemovedAt_SortOrder",
                table: "note_categories",
                columns: new[] { "UserId", "RemovedAt", "SortOrder" });

            migrationBuilder.AddForeignKey(
                name: "FK_user_notes_note_categories_UserId_CategoryId",
                table: "user_notes",
                columns: new[] { "UserId", "CategoryId" },
                principalTable: "note_categories",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_user_notes_note_categories_UserId_CategoryId",
                table: "user_notes");

            migrationBuilder.DropTable(
                name: "note_categories");

            migrationBuilder.DropIndex(
                name: "IX_user_notes_UserId_CategoryId_UpdatedAt_Id",
                table: "user_notes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_note_display",
                table: "user_notes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_note_kind",
                table: "user_notes");

            migrationBuilder.DropColumn(
                name: "NotesAllViewMode",
                table: "user_planning_states");

            migrationBuilder.DropColumn(
                name: "NotesTaskViewMode",
                table: "user_planning_states");

            migrationBuilder.DropColumn(
                name: "CategoryId",
                table: "user_notes");

            migrationBuilder.DropColumn(
                name: "Display",
                table: "user_notes");

            migrationBuilder.DropColumn(
                name: "Title",
                table: "user_notes");

            migrationBuilder.Sql("UPDATE user_notes SET \"Kind\" = 'Distraction' WHERE \"Kind\" = 'General';");
            migrationBuilder.AddCheckConstraint(
                name: "CK_note_kind",
                table: "user_notes",
                sql: "\"Kind\" IN ('Task','Distraction','NextStep','Daily') AND (\"Kind\" NOT IN ('Task','NextStep') OR \"TaskId\" IS NOT NULL) AND ((\"Kind\"='Daily')=(\"LocalDate\" IS NOT NULL))");
        }
    }
}
