using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddHistoricalEventZone : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "task_events",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);

            // Saat dilimini bilmediğimiz eski olayları null bırak.
            // Yeni olayları tek işlemde kaydet. Zincir değişiklikleri ve çalışma olayları da dahil.
            migrationBuilder.Sql("""
                CREATE FUNCTION capture_task_event_zone() RETURNS trigger LANGUAGE plpgsql AS $$
                DECLARE event_zone text;
                BEGIN
                    IF NEW."TimeZoneId" IS NULL THEN
                        SELECT NULLIF(p."Payload"->>'TimeZoneId','') INTO event_zone
                        FROM user_preferences p WHERE p."UserId"=NEW."UserId";
                        NEW."TimeZoneId" := COALESCE(event_zone,'Europe/Istanbul');
                    END IF;
                    RETURN NEW;
                END $$;
                CREATE TRIGGER capture_task_event_zone BEFORE INSERT ON task_events
                    FOR EACH ROW EXECUTE FUNCTION capture_task_event_zone();
                """);

            migrationBuilder.CreateIndex(
                name: "IX_task_events_UserId_TimeZoneId_EffectiveAt_Id",
                table: "task_events",
                columns: new[] { "UserId", "TimeZoneId", "EffectiveAt", "Id" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER capture_task_event_zone ON task_events; DROP FUNCTION capture_task_event_zone();");
            migrationBuilder.DropIndex(
                name: "IX_task_events_UserId_TimeZoneId_EffectiveAt_Id",
                table: "task_events");

            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "task_events");
        }
    }
}
