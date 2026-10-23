using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Adhd.Infrastructure.Persistence.Migrations;

[DbContext(typeof(PlannerDbContext))]
[Migration("20261106205000_CategorizeDailyNotes")]
public sealed class CategorizeDailyNotes : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            INSERT INTO note_categories ("Id","UserId","Name","Color","SortOrder","ShowInBar","PinInAll","ViewMode","CreatedAt","UpdatedAt","Version")
            SELECT gen_random_uuid(), owners."UserId", 'Gün Notları', 'Blue',
                COALESCE((SELECT MAX(c."SortOrder") FROM note_categories c
                    WHERE c."UserId" = owners."UserId" AND c."RemovedAt" IS NULL), 0) + 1024,
                true, false, 'Cards', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
            FROM (SELECT DISTINCT "UserId" FROM user_notes WHERE "Kind" = 'Daily' AND "CategoryId" IS NULL) owners
            WHERE NOT EXISTS (
                SELECT 1 FROM note_categories c
                WHERE c."UserId" = owners."UserId" AND c."RemovedAt" IS NULL
                    AND lower(c."Name" COLLATE adhd_search) = lower('Gün Notları' COLLATE adhd_search)
            );

            WITH categories AS (
                SELECT DISTINCT ON ("UserId") "UserId", "Id" FROM note_categories
                WHERE "RemovedAt" IS NULL AND lower("Name" COLLATE adhd_search) = lower('Gün Notları' COLLATE adhd_search)
                ORDER BY "UserId", "SortOrder", "Id"
            ), moved AS (
                UPDATE user_notes n SET "CategoryId" = c."Id", "Version" = n."Version" + 1
                FROM categories c WHERE n."UserId" = c."UserId" AND n."Kind" = 'Daily' AND n."CategoryId" IS NULL
                RETURNING n."UserId"
            )
            UPDATE user_planning_states s SET "NotesVersion" = s."NotesVersion" + 1
            WHERE s."UserId" IN (SELECT "UserId" FROM moved);
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        // Geri alırken not kategori bağlarını bırak. Bunlar artık kullanıcı verisi ve şema değişmedi.
    }
}
