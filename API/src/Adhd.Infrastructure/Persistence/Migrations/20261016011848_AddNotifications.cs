using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddNotifications : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SourceAt",
                table: "reminder_work",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "NotBefore",
                table: "notification_intents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadAt",
                table: "notification_intents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReadyAt",
                table: "notification_intents",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SnoozeCount",
                table: "notification_intents",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<long>(
                name: "Version",
                table: "notification_intents",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.Sql("""
                UPDATE reminder_work SET "SourceAt"="DueAt" WHERE "SourceAt" IS NULL;
                INSERT INTO outbox_messages ("Id","UserId","EventKey","Kind","SourceId","SourceVersion","Payload","OccurredAt","AvailableAt","State","Attempts","Version")
                SELECT gen_random_uuid(),"UserId",'notification:'||"Id"::text||':snooze:0','NotificationReady',"Id",0,'{}'::jsonb,NOW(),NOW(),'Pending',0,1
                FROM notification_intents WHERE "State"='Pending'
                ON CONFLICT ("UserId","EventKey") DO NOTHING;
                """);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_notification_intents_UserId_Id",
                table: "notification_intents",
                columns: new[] { "UserId", "Id" });

            migrationBuilder.CreateTable(
                name: "custom_reminders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    DueAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Canceled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_custom_reminders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_custom_reminders_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_custom_reminders_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "notification_preferences",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Settings = table.Column<string>(type: "jsonb", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_preferences", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_notification_preferences_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "push_subscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Endpoint = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    EndpointHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    P256dh = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Auth = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Label = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_push_subscriptions", x => x.Id);
                    table.UniqueConstraint("AK_push_subscriptions_UserId_Id", x => new { x.UserId, x.Id });
                    table.ForeignKey(
                        name: "FK_push_subscriptions_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "push_deliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubscriptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnoozeCount = table.Column<int>(type: "integer", nullable: false),
                    State = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DeliveredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastStatusCode = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_push_deliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_push_deliveries_notification_intents_UserId_NotificationId",
                        columns: x => new { x.UserId, x.NotificationId },
                        principalTable: "notification_intents",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_push_deliveries_push_subscriptions_UserId_SubscriptionId",
                        columns: x => new { x.UserId, x.SubscriptionId },
                        principalTable: "push_subscriptions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_notification_versions",
                table: "notification_intents",
                sql: "\"Version\">0 AND \"SnoozeCount\">=0");

            migrationBuilder.CreateIndex(
                name: "IX_custom_reminders_UserId_DueAt_Id",
                table: "custom_reminders",
                columns: new[] { "UserId", "DueAt", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_custom_reminders_UserId_TaskId",
                table: "custom_reminders",
                columns: new[] { "UserId", "TaskId" });

            migrationBuilder.CreateIndex(
                name: "IX_push_deliveries_UserId_NotificationId_SnoozeCount_Subscript~",
                table: "push_deliveries",
                columns: new[] { "UserId", "NotificationId", "SnoozeCount", "SubscriptionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_push_deliveries_UserId_SubscriptionId",
                table: "push_deliveries",
                columns: new[] { "UserId", "SubscriptionId" });

            migrationBuilder.CreateIndex(
                name: "IX_push_subscriptions_EndpointHash",
                table: "push_subscriptions",
                column: "EndpointHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_push_subscriptions_UserId_Active",
                table: "push_subscriptions",
                columns: new[] { "UserId", "Active" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "custom_reminders");

            migrationBuilder.DropTable(
                name: "notification_preferences");

            migrationBuilder.DropTable(
                name: "push_deliveries");

            migrationBuilder.DropTable(
                name: "push_subscriptions");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_notification_intents_UserId_Id",
                table: "notification_intents");

            migrationBuilder.DropCheckConstraint(
                name: "CK_notification_versions",
                table: "notification_intents");

            migrationBuilder.DropColumn(
                name: "SourceAt",
                table: "reminder_work");

            migrationBuilder.DropColumn(
                name: "NotBefore",
                table: "notification_intents");

            migrationBuilder.DropColumn(
                name: "ReadAt",
                table: "notification_intents");

            migrationBuilder.DropColumn(
                name: "ReadyAt",
                table: "notification_intents");

            migrationBuilder.DropColumn(
                name: "SnoozeCount",
                table: "notification_intents");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "notification_intents");
        }
    }
}
