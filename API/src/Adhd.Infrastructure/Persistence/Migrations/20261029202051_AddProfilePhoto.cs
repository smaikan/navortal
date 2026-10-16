using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddProfilePhoto : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "ProfilePhotoCloudVersion",
                table: "users",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProfilePhotoId",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProfilePhotoRevision",
                table: "users",
                type: "uuid",
                nullable: true);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProfilePhotoCloudVersion",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ProfilePhotoId",
                table: "users");

            migrationBuilder.DropColumn(
                name: "ProfilePhotoRevision",
                table: "users");
        }
    }
}
