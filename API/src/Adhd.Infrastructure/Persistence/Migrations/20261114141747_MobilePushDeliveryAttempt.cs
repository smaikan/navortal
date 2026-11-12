using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MobilePushDeliveryAttempt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_mobile_push_deliveries_UserId_NotificationId_SnoozeCount",
                table: "mobile_push_deliveries");

            migrationBuilder.AddColumn<int>(
                name: "Attempt",
                table: "mobile_push_deliveries",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_deliveries_UserId_NotificationId_SnoozeCount_At~",
                table: "mobile_push_deliveries",
                columns: new[] { "UserId", "NotificationId", "SnoozeCount", "Attempt" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_mobile_push_deliveries_UserId_NotificationId_SnoozeCount_At~",
                table: "mobile_push_deliveries");

            migrationBuilder.DropColumn(
                name: "Attempt",
                table: "mobile_push_deliveries");

            migrationBuilder.CreateIndex(
                name: "IX_mobile_push_deliveries_UserId_NotificationId_SnoozeCount",
                table: "mobile_push_deliveries",
                columns: new[] { "UserId", "NotificationId", "SnoozeCount" },
                unique: true);
        }
    }
}
