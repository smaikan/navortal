using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationClientReceipts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "notification_client_receipts",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    NotificationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnoozeCount = table.Column<int>(type: "integer", nullable: false),
                    DisplayedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_notification_client_receipts", x => new { x.UserId, x.NotificationId, x.SnoozeCount });
                    table.CheckConstraint("CK_notification_receipt_round", "\"SnoozeCount\">=0");
                    table.ForeignKey(
                        name: "FK_notification_client_receipts_notification_intents_UserId_No~",
                        columns: x => new { x.UserId, x.NotificationId },
                        principalTable: "notification_intents",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "notification_client_receipts");
        }
    }
}
