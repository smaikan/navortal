using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    // Açıklama üst sınıftaki tanımda.
    public partial class AddManualPlanning : Migration
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "StartedRevisionItemId",
                table: "work_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "StartedScheduleId",
                table: "work_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "daily_plans",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocalDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrentRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    BaselineRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_daily_plans", x => x.Id);
                    table.UniqueConstraint("AK_daily_plans_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_daily_plan_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_daily_plans_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "plan_revisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DailyPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<long>(type: "bigint", nullable: false),
                    PreviousRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    ChangeSetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Trigger = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Reason = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EffectiveAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    AlgorithmVersion = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    SnapshotSchemaVersion = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_revisions", x => x.Id);
                    table.UniqueConstraint("AK_plan_revisions_UserId_DailyPlanId_Id", x => new { x.UserId, x.DailyPlanId, x.Id });
                    table.UniqueConstraint("AK_plan_revisions_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_revision_number", "\"Number\" > 0");
                    table.ForeignKey(
                        name: "FK_plan_revisions_daily_plans_UserId_DailyPlanId",
                        columns: x => new { x.UserId, x.DailyPlanId },
                        principalTable: "daily_plans",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_plan_revisions_plan_revisions_UserId_DailyPlanId_PreviousRe~",
                        columns: x => new { x.UserId, x.DailyPlanId, x.PreviousRevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "DailyPlanId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "task_schedules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DailyPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    TaskId = table.Column<Guid>(type: "uuid", nullable: true),
                    Kind = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    IsFixed = table.Column<bool>(type: "boolean", nullable: false),
                    IsLocked = table.Column<bool>(type: "boolean", nullable: false),
                    SplitGroupId = table.Column<Guid>(type: "uuid", nullable: true),
                    OriginScheduleId = table.Column<Guid>(type: "uuid", nullable: true),
                    TaskSnapshot = table.Column<string>(type: "jsonb", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_task_schedules", x => x.Id);
                    table.UniqueConstraint("AK_task_schedules_UserId_Id", x => new { x.UserId, x.Id });
                    table.CheckConstraint("CK_schedule_kind", "(\"Kind\" = 'Work' AND \"TaskId\" IS NOT NULL) OR (\"Kind\" IN ('Break','Buffer') AND \"TaskId\" IS NULL)");
                    table.CheckConstraint("CK_schedule_range", "\"StartsAt\" < \"EndsAt\"");
                    table.CheckConstraint("CK_schedule_state", "\"State\" IN ('Planned','Removed')");
                    table.CheckConstraint("CK_schedule_version", "\"Version\" > 0");
                    table.ForeignKey(
                        name: "FK_task_schedules_daily_plans_UserId_DailyPlanId",
                        columns: x => new { x.UserId, x.DailyPlanId },
                        principalTable: "daily_plans",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_schedules_task_schedules_UserId_OriginScheduleId",
                        columns: x => new { x.UserId, x.OriginScheduleId },
                        principalTable: "task_schedules",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_task_schedules_tasks_UserId_TaskId",
                        columns: x => new { x.UserId, x.TaskId },
                        principalTable: "tasks",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "plan_revision_changes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Before = table.Column<string>(type: "jsonb", nullable: true),
                    After = table.Column<string>(type: "jsonb", nullable: true),
                    ConflictsAccepted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_revision_changes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_plan_revision_changes_plan_revisions_UserId_RevisionId",
                        columns: x => new { x.UserId, x.RevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_plan_revision_changes_task_schedules_UserId_ScheduleId",
                        columns: x => new { x.UserId, x.ScheduleId },
                        principalTable: "task_schedules",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "plan_revision_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: false),
                    Snapshot = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_plan_revision_items", x => x.Id);
                    table.UniqueConstraint("AK_plan_revision_items_UserId_ScheduleId_Id", x => new { x.UserId, x.ScheduleId, x.Id });
                    table.ForeignKey(
                        name: "FK_plan_revision_items_plan_revisions_UserId_RevisionId",
                        columns: x => new { x.UserId, x.RevisionId },
                        principalTable: "plan_revisions",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_plan_revision_items_task_schedules_UserId_ScheduleId",
                        columns: x => new { x.UserId, x.ScheduleId },
                        principalTable: "task_schedules",
                        principalColumns: new[] { "UserId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_work_sessions_UserId_StartedScheduleId_StartedRevisionItemId",
                table: "work_sessions",
                columns: new[] { "UserId", "StartedScheduleId", "StartedRevisionItemId" });

            migrationBuilder.AddCheckConstraint(
                name: "CK_work_plan_context",
                table: "work_sessions",
                sql: "(\"StartedScheduleId\" IS NULL AND \"StartedRevisionItemId\" IS NULL) OR (\"TaskId\" IS NOT NULL AND \"StartedScheduleId\" IS NOT NULL AND \"StartedRevisionItemId\" IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "IX_daily_plans_UserId_Id_BaselineRevisionId",
                table: "daily_plans",
                columns: new[] { "UserId", "Id", "BaselineRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_daily_plans_UserId_Id_CurrentRevisionId",
                table: "daily_plans",
                columns: new[] { "UserId", "Id", "CurrentRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_daily_plans_UserId_LocalDate",
                table: "daily_plans",
                columns: new[] { "UserId", "LocalDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_changes_UserId_RevisionId_Id",
                table: "plan_revision_changes",
                columns: new[] { "UserId", "RevisionId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_changes_UserId_ScheduleId",
                table: "plan_revision_changes",
                columns: new[] { "UserId", "ScheduleId" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revision_items_UserId_RevisionId_ScheduleId",
                table: "plan_revision_items",
                columns: new[] { "UserId", "RevisionId", "ScheduleId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_plan_revisions_UserId_ChangeSetId",
                table: "plan_revisions",
                columns: new[] { "UserId", "ChangeSetId" });

            migrationBuilder.CreateIndex(
                name: "IX_plan_revisions_UserId_DailyPlanId_Number",
                table: "plan_revisions",
                columns: new[] { "UserId", "DailyPlanId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_plan_revisions_UserId_DailyPlanId_PreviousRevisionId",
                table: "plan_revisions",
                columns: new[] { "UserId", "DailyPlanId", "PreviousRevisionId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_schedules_UserId_DailyPlanId_StartsAt",
                table: "task_schedules",
                columns: new[] { "UserId", "DailyPlanId", "StartsAt" });

            migrationBuilder.CreateIndex(
                name: "IX_task_schedules_UserId_Id_TaskId",
                table: "task_schedules",
                columns: new[] { "UserId", "Id", "TaskId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_schedules_UserId_OriginScheduleId",
                table: "task_schedules",
                columns: new[] { "UserId", "OriginScheduleId" });

            migrationBuilder.CreateIndex(
                name: "IX_task_schedules_UserId_TaskId_EndsAt",
                table: "task_schedules",
                columns: new[] { "UserId", "TaskId", "EndsAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_work_sessions_plan_revision_items_UserId_StartedScheduleId_~",
                table: "work_sessions",
                columns: new[] { "UserId", "StartedScheduleId", "StartedRevisionItemId" },
                principalTable: "plan_revision_items",
                principalColumns: new[] { "UserId", "ScheduleId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_work_sessions_task_schedules_UserId_StartedScheduleId",
                table: "work_sessions",
                columns: new[] { "UserId", "StartedScheduleId" },
                principalTable: "task_schedules",
                principalColumns: new[] { "UserId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_daily_plans_plan_revisions_UserId_Id_BaselineRevisionId",
                table: "daily_plans",
                columns: new[] { "UserId", "Id", "BaselineRevisionId" },
                principalTable: "plan_revisions",
                principalColumns: new[] { "UserId", "DailyPlanId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_daily_plans_plan_revisions_UserId_Id_CurrentRevisionId",
                table: "daily_plans",
                columns: new[] { "UserId", "Id", "CurrentRevisionId" },
                principalTable: "plan_revisions",
                principalColumns: new[] { "UserId", "DailyPlanId", "Id" },
                onDelete: ReferentialAction.Restrict);
            migrationBuilder.Sql("""
                ALTER TABLE work_sessions ADD CONSTRAINT "FK_work_start_task_match"
                FOREIGN KEY ("UserId", "StartedScheduleId", "TaskId") REFERENCES task_schedules ("UserId", "Id", "TaskId") ON DELETE RESTRICT;
                """);
        }

        // Açıklama üst sınıftaki tanımda.
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("ALTER TABLE work_sessions DROP CONSTRAINT \"FK_work_start_task_match\";");
            migrationBuilder.DropForeignKey(
                name: "FK_work_sessions_plan_revision_items_UserId_StartedScheduleId_~",
                table: "work_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_work_sessions_task_schedules_UserId_StartedScheduleId",
                table: "work_sessions");

            migrationBuilder.DropForeignKey(
                name: "FK_daily_plans_plan_revisions_UserId_Id_BaselineRevisionId",
                table: "daily_plans");

            migrationBuilder.DropForeignKey(
                name: "FK_daily_plans_plan_revisions_UserId_Id_CurrentRevisionId",
                table: "daily_plans");

            migrationBuilder.DropTable(
                name: "plan_revision_changes");

            migrationBuilder.DropTable(
                name: "plan_revision_items");

            migrationBuilder.DropTable(
                name: "task_schedules");

            migrationBuilder.DropTable(
                name: "plan_revisions");

            migrationBuilder.DropTable(
                name: "daily_plans");

            migrationBuilder.DropIndex(
                name: "IX_work_sessions_UserId_StartedScheduleId_StartedRevisionItemId",
                table: "work_sessions");

            migrationBuilder.DropCheckConstraint(
                name: "CK_work_plan_context",
                table: "work_sessions");

            migrationBuilder.DropColumn(
                name: "StartedRevisionItemId",
                table: "work_sessions");

            migrationBuilder.DropColumn(
                name: "StartedScheduleId",
                table: "work_sessions");
        }
    }
}
