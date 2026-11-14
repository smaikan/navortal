using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMobilePush : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "mobile_push_devices",
                columns: table => new
                {
                    InstallationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProtectedToken = table.Column<string>(type: "character varying(8192)", maxLength: 8192, nullable: true),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    BindingVersion = table.Column<long>(type: "bigint", nullable: false),
                    ClientSequence = table.Column<long>(type: "bigint", nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Permission = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RemindersChannelEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    AppVersion = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    BuildNumber = table.Column<long>(type: "bigint", nullable: false),
                    OsVersion = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LastSeenAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_push_devices", x => x.InstallationId);
                    table.ForeignKey(
                        name: "FK_mobile_push_devices_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "mobile_push_preferences",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_push_preferences", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_mobile_push_preferences_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "mobile_push_routes",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnoozeCount = table.Column<int>(type: "integer", nullable: false),
                    Channel = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_push_routes", x => new { x.UserId, x.NotificationId, x.SnoozeCount });
                    table.ForeignKey(
                        name: "FK_mobile_push_routes_notification_intents_UserId_Notification~",
                        columns: x => new { x.UserId, x.NotificationId },
                        principalTable: "notification_intents",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "mobile_push_deliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnoozeCount = table.Column<int>(type: "integer", nullable: false),
                    InstallationId = table.Column<Guid>(type: "uuid", nullable: false),
                    BindingVersion = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ProviderAcceptedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    DisplayedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastErrorCode = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mobile_push_deliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_mobile_push_deliveries_mobile_push_devices_InstallationId",
                        column: x => x.InstallationId,
                        principalTable: "mobile_push_devices",
                        principalColumn: "InstallationId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_mobile_push_deliveries_mobile_push_routes_UserId_Notificati~",
                        columns: x => new { x.UserId, x.NotificationId, x.SnoozeCount },
                        principalTable: "mobile_push_routes",
                        principalColumns: new[] { "UserId", "NotificationId", "SnoozeCount" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_deliveries_InstallationId",
                table: "mobile_push_deliveries",
                column: "InstallationId");

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_deliveries_UserId_NotificationId_SnoozeCount",
                table: "mobile_push_deliveries",
                columns: new[] { "UserId", "NotificationId", "SnoozeCount" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_devices_TokenHash",
                table: "mobile_push_devices",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_devices_UserId_Active",
                table: "mobile_push_devices",
                columns: new[] { "UserId", "Active" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "mobile_push_deliveries");

            migrationBuilder.DropTable(
                name: "mobile_push_preferences");

            migrationBuilder.DropTable(
                name: "mobile_push_devices");

            migrationBuilder.DropTable(
                name: "mobile_push_routes");
        }
    }
}
