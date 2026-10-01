using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddNamedCollections : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "task_categories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_categories", x => x.Id);
                    table.UniqueConstraint("AK_task_categories_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_task_categories_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("CK_task_categories_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_task_categories_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_pools",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_pools", x => x.Id);
                    table.UniqueConstraint("AK_task_pools_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_task_pools_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("CK_task_pools_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_task_pools_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_projects",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_projects", x => x.Id);
                    table.UniqueConstraint("AK_task_projects_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_task_projects_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("CK_task_projects_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_task_projects_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_tags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "character varying(10000)", maxLength: 10000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ArchivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_tags", x => x.Id);
                    table.UniqueConstraint("AK_task_tags_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_task_tags_name", "length(btrim(\"Name\")) > 0");
                    table.CheckConstraint("CK_task_tags_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_task_tags_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_task_categories_UserId_Name_Id",
                table: "task_categories",
                columns: new[] { "UserId", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_task_pools_UserId_Name_Id",
                table: "task_pools",
                columns: new[] { "UserId", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_task_projects_UserId_Name_Id",
                table: "task_projects",
                columns: new[] { "UserId", "Name", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_task_tags_UserId_Name_Id",
                table: "task_tags",
                columns: new[] { "UserId", "Name", "Id" });
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "task_categories");

            migrationBuilder.DropTable(
                name: "task_pools");

            migrationBuilder.DropTable(
                name: "task_projects");

            migrationBuilder.DropTable(
                name: "task_tags");
        }
    }
}
