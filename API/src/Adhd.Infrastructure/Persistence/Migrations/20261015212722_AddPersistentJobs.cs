using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddPersistentJobs : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_intents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceKey = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    DailyPlanId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_intents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_notification_intents_daily_plans_UserId_DailyPlanId",
                        columns: x => new { x.UserId, x.DailyPlanId },
                        principalTable: "daily_plans",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_notification_intents_plan_revisions_UserId_RevisionId",
                        columns: x => new { x.UserId, x.RevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_notification_intents_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_notification_intents_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "outbox_messages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventKey = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Kind = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    Payload = table.Column<string>(type: "jsonb", nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AvailableAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    LeaseId = table.Column<Guid>(type: "uuid", nullable: true),
                    LeaseUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastErrorCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_outbox_messages", x => x.Id);
                    table.UniqueConstraint("AK_outbox_messages_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_outbox_attempts", "\"Attempts\" BETWEEN 0 AND 5 AND \"Version\">0");
                    table.CheckConstraint("CK_outbox_lease", "(\"State\"='Processing' AND \"LeaseId\" IS NOT NULL AND \"LeaseUntil\" IS NOT NULL) OR (\"State\"<>'Processing' AND \"LeaseId\" IS NULL AND \"LeaseUntil\" IS NULL)");
                    table.CheckConstraint("CK_outbox_state", "\"State\" IN ('Pending','Processing','Completed','Obsolete','Failed')");
                    table.ForeignKey(
                        name: "FK_outbox_messages_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reminder_work",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceKey = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Kind = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: false),
                    DailyPlanId = table.Column<Guid>(type: "uuid", nullable: true),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    HandledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reminder_work", x => x.Id);
                    table.ForeignKey(
                        name: "FK_reminder_work_daily_plans_UserId_DailyPlanId",
                        columns: x => new { x.UserId, x.DailyPlanId },
                        principalTable: "daily_plans",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_reminder_work_plan_revisions_UserId_RevisionId",
                        columns: x => new { x.UserId, x.RevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_reminder_work_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "job_effect_receipts",
                columns: table => new
                {
                    OutboxId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ResolvedInput = table.Column<string>(type: "jsonb", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_job_effect_receipts", x => x.OutboxId);
                    table.ForeignKey(
                        name: "FK_job_effect_receipts_outbox_messages_UserId_OutboxId",
                        columns: x => new { x.UserId, x.OutboxId },
                        principalTable: "outbox_messages",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_job_effect_receipts_UserId_OutboxId",
                table: "job_effect_receipts",
                columns: new[] { "UserId", "OutboxId" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_intents_UserId_CreatedAt_Id",
                table: "notification_intents",
                columns: new[] { "UserId", "CreatedAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_intents_UserId_DailyPlanId",
                table: "notification_intents",
                columns: new[] { "UserId", "DailyPlanId" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_intents_UserId_RevisionId",
                table: "notification_intents",
                columns: new[] { "UserId", "RevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_notification_intents_UserId_SourceKey",
                table: "notification_intents",
                columns: new[] { "UserId", "SourceKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_notification_intents_UserId_TaskId",
                table: "notification_intents",
                columns: new[] { "UserId", "TaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_State_AvailableAt_Id",
                table: "outbox_messages",
                columns: new[] { "State", "AvailableAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_State_LeaseUntil",
                table: "outbox_messages",
                columns: new[] { "State", "LeaseUntil" });

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_UserId_EventKey",
                table: "outbox_messages",
                columns: new[] { "UserId", "EventKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_outbox_messages_UserId_OccurredAt_Id",
                table: "outbox_messages",
                columns: new[] { "UserId", "OccurredAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_reminder_work_State_DueAt_Id",
                table: "reminder_work",
                columns: new[] { "State", "DueAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_reminder_work_UserId_DailyPlanId",
                table: "reminder_work",
                columns: new[] { "UserId", "DailyPlanId" });

            migrationBuilder.CreateIndex(
                name: "IX_reminder_work_UserId_RevisionId",
                table: "reminder_work",
                columns: new[] { "UserId", "RevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_reminder_work_UserId_SourceKey",
                table: "reminder_work",
                columns: new[] { "UserId", "SourceKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reminder_work_UserId_TaskId",
                table: "reminder_work",
                columns: new[] { "UserId", "TaskId" });
            using (var stream = typeof(AddPersistentJobs).Assembly.GetManifestResourceStream("Adhd.Infrastructure.Persistence.Resources.quartz-4.5.0-postgres.sql")
                ?? throw new InvalidOperationException("Pinned Quartz schema resource is missing."))
            using (var reader = new System.IO.StreamReader(stream)) migrationBuilder.Sql(reader.ReadToEnd());
            // Outbox öncesi mevcut durumu al. Geçmişe yeni olay ekleme
            migrationBuilder.Sql("""
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                    SELECT gen_random_uuid(),t."UserId",'bootstrap-task:'||t."Id"||':v'||t."Version",'TaskChanged',t."Id",t."Version",'{"bootstrap":true}'::jsonb,now(),now(),'Pending',0,1 FROM tasks t;
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                    SELECT gen_random_uuid(),r."UserId",'revision:'||r."Id",'PlanChanged',r."Id",r."Number",'{"bootstrap":true}'::jsonb,now(),now(),'Pending',0,1
                    FROM plan_revisions r JOIN daily_plans p ON p."CurrentRevisionId"=r."Id" AND p."UserId"=r."UserId";
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                    SELECT gen_random_uuid(),f."UserId",'focus:'||f."Id"||':target','FocusTargetReached',f."Id",0,'{"bootstrap":true}'::jsonb,now(),now(),'Pending',0,1
                    FROM focus_sessions f WHERE f."TargetReachedAt" IS NOT NULL AND f."State" NOT IN ('Finished','Interrupted');
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                    SELECT gen_random_uuid(),t."UserId",'recurrence:'||t."Id"||':v'||t."Version",'RecurrenceChanged',t."Id",t."Version",'{"bootstrap":true}'::jsonb,now(),now(),'Pending',0,1 FROM recurrence_templates t WHERE t."Enabled";
                """);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DROP TABLE qrtz_fired_triggers, qrtz_paused_trigger_grps, qrtz_paused_job_grps, qrtz_scheduler_state, qrtz_locks,
                    qrtz_simprop_triggers, qrtz_simple_triggers, qrtz_cron_triggers, qrtz_blob_triggers, qrtz_triggers, qrtz_job_details,
                    qrtz_calendars, qrtz_execution_history, qrtz_misfire_history, qrtz_job_status;
                """);
            migrationBuilder.DropTable(
                name: "job_effect_receipts");

            migrationBuilder.DropTable(
                name: "notification_intents");

            migrationBuilder.DropTable(
                name: "reminder_work");

            migrationBuilder.DropTable(
                name: "outbox_messages");
        }
    }
}
