// Bu dosyayı EF Core oluşturdu.
using System;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(PlannerDbContext))]
    partial class PlannerDbContextModelSnapshot : ModelSnapshot
    {
        protected override void BuildModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("Npgsql:CollationDefinition:adhd_search", "tr,tr,icu,True")
                .HasAnnotation("ProductVersion", "10.0.13")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.HasPostgresExtension(modelBuilder, "btree_gist");
            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

            modelBuilder.Entity("Adhd.Domain.Collections.TaskCategory", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)")
                        .UseCollation("adhd_search");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "Name", "Id");

                    b.ToTable("task_categories", null, t =>
                        {
                            t.HasCheckConstraint("CK_task_categories_name", "length(btrim(\"Name\")) > 0");

                            t.HasCheckConstraint("CK_task_categories_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskPool", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)")
                        .UseCollation("adhd_search");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "Name", "Id");

                    b.ToTable("task_pools", null, t =>
                        {
                            t.HasCheckConstraint("CK_task_pools_name", "length(btrim(\"Name\")) > 0");

                            t.HasCheckConstraint("CK_task_pools_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskProject", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)")
                        .UseCollation("adhd_search");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "Name", "Id");

                    b.ToTable("task_projects", null, t =>
                        {
                            t.HasCheckConstraint("CK_task_projects_name", "length(btrim(\"Name\")) > 0");

                            t.HasCheckConstraint("CK_task_projects_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskTag", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)")
                        .UseCollation("adhd_search");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "Name", "Id");

                    b.ToTable("task_tags", null, t =>
                        {
                            t.HasCheckConstraint("CK_task_tags_name", "length(btrim(\"Name\")) > 0");

                            t.HasCheckConstraint("CK_task_tags_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Focus.FocusPreset", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Settings")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "Name", "Id");

                    b.ToTable("focus_presets", null, t =>
                        {
                            t.HasCheckConstraint("CK_focus_preset_version", "\"Version\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Focus.FocusSession", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("BreakEndedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("BreakStartedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<int>("CycleNumber")
                        .HasColumnType("integer");

                    b.Property<DateTimeOffset?>("EndedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("PresetId")
                        .HasColumnType("uuid");

                    b.Property<string>("PresetName")
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<long?>("PresetVersion")
                        .HasColumnType("bigint");

                    b.Property<Guid?>("PreviousFocusId")
                        .HasColumnType("uuid");

                    b.Property<string>("Settings")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<DateTimeOffset>("StartedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<DateTimeOffset?>("TargetObservedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("TargetReachedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<DateTimeOffset?>("WorkEndedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("WorkSessionId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId")
                        .IsUnique()
                        .HasFilter("\"State\" NOT IN ('Finished','Interrupted')");

                    b.HasIndex("UserId", "PresetId");

                    b.HasIndex("UserId", "PreviousFocusId")
                        .IsUnique()
                        .HasFilter("\"PreviousFocusId\" IS NOT NULL");

                    b.HasIndex("UserId", "WorkSessionId");

                    b.HasIndex("UserId", "StartedAt", "Id");

                    b.ToTable("focus_sessions", null, t =>
                        {
                            t.HasCheckConstraint("CK_focus_state", "\"State\" IN ('Working','Paused','Break','AwaitingNext','Finished','Interrupted')");

                            t.HasCheckConstraint("CK_focus_target", "(\"TargetReachedAt\" IS NULL) = (\"TargetObservedAt\" IS NULL)");

                            t.HasCheckConstraint("CK_focus_terminal", "(\"State\" IN ('Finished','Interrupted')) = (\"EndedAt\" IS NOT NULL)");

                            t.HasCheckConstraint("CK_focus_time", "(\"WorkEndedAt\" IS NULL OR \"WorkEndedAt\">=\"StartedAt\") AND (\"BreakStartedAt\" IS NULL OR \"BreakStartedAt\">=\"WorkEndedAt\") AND (\"BreakEndedAt\" IS NULL OR \"BreakEndedAt\">=\"BreakStartedAt\") AND (\"EndedAt\" IS NULL OR \"EndedAt\">=\"StartedAt\")");

                            t.HasCheckConstraint("CK_focus_version", "\"Version\">0 AND \"CycleNumber\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.JobEffectReceipt", b =>
                {
                    b.Property<Guid>("OutboxId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("CompletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("ResolvedInput")
                        .HasColumnType("jsonb");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("OutboxId");

                    b.HasIndex("UserId", "OutboxId");

                    b.ToTable("job_effect_receipts", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.NotificationIntent", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("DailyPlanId")
                        .HasColumnType("uuid");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(40)
                        .HasColumnType("character varying(40)");

                    b.Property<DateTimeOffset?>("NotBefore")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("OccurredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("ReadAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("ReadyAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("RevisionId")
                        .HasColumnType("uuid");

                    b.Property<int>("SnoozeCount")
                        .HasColumnType("integer");

                    b.Property<Guid>("SourceId")
                        .HasColumnType("uuid");

                    b.Property<string>("SourceKey")
                        .IsRequired()
                        .HasMaxLength(250)
                        .HasColumnType("character varying(250)");

                    b.Property<long>("SourceVersion")
                        .HasColumnType("bigint");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("Title")
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "DailyPlanId");

                    b.HasIndex("UserId", "RevisionId");

                    b.HasIndex("UserId", "SourceKey")
                        .IsUnique();

                    b.HasIndex("UserId", "TaskId");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.ToTable("notification_intents", null, t =>
                        {
                            t.HasCheckConstraint("CK_notification_versions", "\"Version\">0 AND \"SnoozeCount\">=0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.OutboxMessage", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<int>("Attempts")
                        .HasColumnType("integer");

                    b.Property<DateTimeOffset>("AvailableAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("CompletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("EventKey")
                        .IsRequired()
                        .HasMaxLength(250)
                        .HasColumnType("character varying(250)");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(40)
                        .HasColumnType("character varying(40)");

                    b.Property<string>("LastErrorCode")
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<Guid?>("LeaseId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("LeaseUntil")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("OccurredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Payload")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid>("SourceId")
                        .HasColumnType("uuid");

                    b.Property<long>("SourceVersion")
                        .HasColumnType("bigint");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("State", "LeaseUntil");

                    b.HasIndex("UserId", "EventKey")
                        .IsUnique();

                    b.HasIndex("State", "AvailableAt", "Id");

                    b.HasIndex("UserId", "OccurredAt", "Id");

                    b.ToTable("outbox_messages", null, t =>
                        {
                            t.HasCheckConstraint("CK_outbox_attempts", "\"Attempts\" BETWEEN 0 AND 5 AND \"Version\">0");

                            t.HasCheckConstraint("CK_outbox_lease", "(\"State\"='Processing' AND \"LeaseId\" IS NOT NULL AND \"LeaseUntil\" IS NOT NULL) OR (\"State\"<>'Processing' AND \"LeaseId\" IS NULL AND \"LeaseUntil\" IS NULL)");

                            t.HasCheckConstraint("CK_outbox_state", "\"State\" IN ('Pending','Processing','Completed','Obsolete','Failed')");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.ReminderWork", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("DailyPlanId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("DueAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("HandledAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<Guid?>("RevisionId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("SourceAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("SourceId")
                        .HasColumnType("uuid");

                    b.Property<string>("SourceKey")
                        .IsRequired()
                        .HasMaxLength(250)
                        .HasColumnType("character varying(250)");

                    b.Property<long>("SourceVersion")
                        .HasColumnType("bigint");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "DailyPlanId");

                    b.HasIndex("UserId", "RevisionId");

                    b.HasIndex("UserId", "SourceKey")
                        .IsUnique();

                    b.HasIndex("UserId", "TaskId");

                    b.HasIndex("State", "DueAt", "Id");

                    b.ToTable("reminder_work", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.CustomReminder", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<bool>("Canceled")
                        .HasColumnType("boolean");

                    b.Property<DateTimeOffset>("DueAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("NextDueAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("RepeatSettings")
                        .HasColumnType("jsonb");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("Title")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TaskId");

                    b.HasIndex("UserId", "DueAt", "Id");

                    b.ToTable("custom_reminders", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.NotificationPreferences", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<string>("Settings")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("UserId");

                    b.ToTable("notification_preferences", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.PushDelivery", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("DeliveredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<int?>("LastStatusCode")
                        .HasColumnType("integer");

                    b.Property<Guid>("NotificationId")
                        .HasColumnType("uuid");

                    b.Property<int>("SnoozeCount")
                        .HasColumnType("integer");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<Guid>("SubscriptionId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "SubscriptionId");

                    b.HasIndex("UserId", "NotificationId", "SnoozeCount", "SubscriptionId")
                        .IsUnique();

                    b.ToTable("push_deliveries", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.PushSubscriptionRecord", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<bool>("Active")
                        .HasColumnType("boolean");

                    b.Property<string>("Auth")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("character varying(50)");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Endpoint")
                        .IsRequired()
                        .HasMaxLength(2048)
                        .HasColumnType("character varying(2048)");

                    b.Property<string>("EndpointHash")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<DateTimeOffset?>("ExpiresAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Label")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("P256dh")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("EndpointHash")
                        .IsUnique();

                    b.HasIndex("UserId", "Active");

                    b.ToTable("push_subscriptions", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.DailyPlan", b =>
                {
                    b.Property<Guid>("Id")
                        .HasColumnType("uuid");

                    b.Property<Guid?>("BaselineRevisionId")
                        .HasColumnType("uuid");

                    b.Property<Guid?>("CurrentRevisionId")
                        .HasColumnType("uuid");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<string>("TimeZoneId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "LocalDate")
                        .IsUnique();

                    b.HasIndex("UserId", "Id", "BaselineRevisionId");

                    b.HasIndex("UserId", "Id", "CurrentRevisionId");

                    b.ToTable("daily_plans", null, t =>
                        {
                            t.HasCheckConstraint("CK_daily_plan_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Planning.DayItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("CompletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("EndsAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("IsUrgent")
                        .HasColumnType("boolean");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<Guid?>("ScheduleId")
                        .HasColumnType("uuid");

                    b.Property<int>("SortOrder")
                        .HasColumnType("integer");

                    b.Property<DateTimeOffset?>("StartsAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("TimingIssue")
                        .HasMaxLength(60)
                        .HasColumnType("character varying(60)");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TaskId");

                    b.HasIndex("UserId", "LocalDate", "SortOrder");

                    b.HasIndex("UserId", "LocalDate", "TaskId")
                        .IsUnique()
                        .HasFilter("\"State\" = 'Planned'");

                    b.ToTable("day_items", null, t =>
                        {
                            t.HasCheckConstraint("CK_day_item_sort", "\"SortOrder\" >= 0");

                            t.HasCheckConstraint("CK_day_item_state", "\"State\" IN ('Planned','Removed','Scheduled')");

                            t.HasCheckConstraint("CK_day_item_time", "\"EndsAt\" IS NULL OR (\"StartsAt\" IS NOT NULL AND \"StartsAt\" < \"EndsAt\")");

                            t.HasCheckConstraint("CK_day_item_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevision", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("AlgorithmVersion")
                        .IsRequired()
                        .HasMaxLength(60)
                        .HasColumnType("character varying(60)");

                    b.Property<Guid>("ChangeSetId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("DailyPlanId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("EffectiveAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<long>("Number")
                        .HasColumnType("bigint");

                    b.Property<Guid?>("PreviousRevisionId")
                        .HasColumnType("uuid");

                    b.Property<string>("Reason")
                        .IsRequired()
                        .HasMaxLength(2000)
                        .HasColumnType("character varying(2000)");

                    b.Property<Guid?>("ReversesChangeSetId")
                        .HasColumnType("uuid");

                    b.Property<int>("SnapshotSchemaVersion")
                        .HasColumnType("integer");

                    b.Property<string>("Trigger")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "ChangeSetId");

                    b.HasIndex("UserId", "ReversesChangeSetId");

                    b.HasIndex("UserId", "DailyPlanId", "Number")
                        .IsUnique();

                    b.HasIndex("UserId", "DailyPlanId", "PreviousRevisionId");

                    b.ToTable("plan_revisions", null, t =>
                        {
                            t.HasCheckConstraint("CK_revision_number", "\"Number\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionChange", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("After")
                        .HasColumnType("jsonb");

                    b.Property<string>("Before")
                        .HasColumnType("jsonb");

                    b.Property<bool>("ConflictsAccepted")
                        .HasColumnType("boolean");

                    b.Property<Guid?>("DayItemId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("RevisionId")
                        .HasColumnType("uuid");

                    b.Property<Guid?>("ScheduleId")
                        .HasColumnType("uuid");

                    b.Property<string>("Type")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "DayItemId");

                    b.HasIndex("UserId", "ScheduleId");

                    b.HasIndex("UserId", "RevisionId", "Id");

                    b.ToTable("plan_revision_changes", null, t =>
                        {
                            t.HasCheckConstraint("CK_revision_change_target", "(\"ScheduleId\" IS NULL) <> (\"DayItemId\" IS NULL)");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionDayItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("DayItemId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("RevisionId")
                        .HasColumnType("uuid");

                    b.Property<string>("Snapshot")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "DayItemId");

                    b.HasIndex("UserId", "RevisionId", "DayItemId")
                        .IsUnique();

                    b.ToTable("plan_revision_day_items", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("RevisionId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("ScheduleId")
                        .HasColumnType("uuid");

                    b.Property<string>("Snapshot")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "RevisionId", "ScheduleId")
                        .IsUnique();

                    b.ToTable("plan_revision_items", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.TaskSchedule", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("CompletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("DailyPlanId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("EndsAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("IsAutomatic")
                        .HasColumnType("boolean");

                    b.Property<bool>("IsFixed")
                        .HasColumnType("boolean");

                    b.Property<bool>("IsLocked")
                        .HasColumnType("boolean");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid?>("OriginScheduleId")
                        .HasColumnType("uuid");

                    b.Property<Guid?>("SplitGroupId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("StartsAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("TaskSnapshot")
                        .HasColumnType("jsonb");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "OriginScheduleId");

                    b.HasIndex("UserId", "DailyPlanId", "StartsAt");

                    b.HasIndex("UserId", "Id", "TaskId")
                        .IsUnique();

                    b.HasIndex("UserId", "TaskId", "EndsAt");

                    b.ToTable("task_schedules", null, t =>
                        {
                            t.HasCheckConstraint("CK_schedule_kind", "(\"Kind\" = 'Work' AND \"TaskId\" IS NOT NULL) OR (\"Kind\" IN ('Break','Buffer') AND \"TaskId\" IS NULL)");

                            t.HasCheckConstraint("CK_schedule_range", "\"StartsAt\" < \"EndsAt\"");

                            t.HasCheckConstraint("CK_schedule_state", "\"State\" IN ('Planned','Removed')");

                            t.HasCheckConstraint("CK_schedule_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceDefinition", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateOnly>("EffectiveFrom")
                        .HasColumnType("date");

                    b.Property<long>("Number")
                        .HasColumnType("bigint");

                    b.Property<string>("Rule")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<string>("TaskDefaults")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid>("TemplateId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TemplateId", "Number")
                        .IsUnique();

                    b.ToTable("recurrence_definitions", null, t =>
                        {
                            t.HasCheckConstraint("CK_recurrence_definition_number", "\"Number\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceOccurrence", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("AppliedDefinitionId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("DefinitionId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("DueAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<TimeOnly?>("DueTime")
                        .HasColumnType("time without time zone");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<string>("Reason")
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<long?>("SyncedTaskVersion")
                        .HasColumnType("bigint");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("TemplateId")
                        .HasColumnType("uuid");

                    b.Property<bool>("TimeAdjusted")
                        .HasColumnType("boolean");

                    b.Property<string>("TimeZoneId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TaskId")
                        .IsUnique()
                        .HasFilter("\"TaskId\" IS NOT NULL");

                    b.HasIndex("UserId", "TemplateId", "AppliedDefinitionId");

                    b.HasIndex("UserId", "TemplateId", "DefinitionId");

                    b.HasIndex("UserId", "TemplateId", "LocalDate")
                        .IsUnique();

                    b.ToTable("recurrence_occurrences", null, t =>
                        {
                            t.HasCheckConstraint("CK_occurrence_state", "\"State\" IN ('Materialized','Skipped','Canceled') AND (\"State\"<>'Materialized' OR \"TaskId\" IS NOT NULL)");

                            t.HasCheckConstraint("CK_occurrence_task_version", "(\"TaskId\" IS NULL)=(\"SyncedTaskVersion\" IS NULL) AND (\"SyncedTaskVersion\" IS NULL OR \"SyncedTaskVersion\">0)");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceTemplate", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("Enabled")
                        .HasColumnType("boolean");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.ToTable("recurrence_templates", null, t =>
                        {
                            t.HasCheckConstraint("CK_recurrence_version", "\"Version\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.SpecialDays.SpecialDay", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<int>("Day")
                        .HasColumnType("integer");

                    b.Property<DateTimeOffset?>("DeletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<int>("Month")
                        .HasColumnType("integer");

                    b.Property<bool>("NonWorking")
                        .HasColumnType("boolean");

                    b.Property<string>("Recurrence")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<string>("Reminder")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<string>("Title")
                        .IsRequired()
                        .HasMaxLength(120)
                        .HasColumnType("character varying(120)");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<int?>("Year")
                        .HasColumnType("integer");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "DeletedAt", "Month", "Day");

                    b.ToTable("special_days", null, t =>
                        {
                            t.HasCheckConstraint("CK_special_day_day", "\"Day\" BETWEEN 1 AND 31");

                            t.HasCheckConstraint("CK_special_day_month", "\"Month\" BETWEEN 1 AND 12");

                            t.HasCheckConstraint("CK_special_day_once_year", "\"Recurrence\" <> 'Once' OR \"Year\" IS NOT NULL");

                            t.HasCheckConstraint("CK_special_day_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Support.DailyCriticalTask", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<int>("Slot")
                        .HasColumnType("integer");

                    b.HasKey("UserId", "LocalDate", "TaskId");

                    b.HasIndex("UserId", "TaskId");

                    b.HasIndex("UserId", "LocalDate", "Slot")
                        .IsUnique();

                    b.ToTable("daily_critical_tasks", null, t =>
                        {
                            t.HasCheckConstraint("CK_critical_slot", "\"Slot\" BETWEEN 1 AND 3");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Support.NoteCategory", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("Color")
                        .IsRequired()
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Name")
                        .IsRequired()
                        .HasMaxLength(40)
                        .HasColumnType("character varying(40)");

                    b.Property<bool>("PinInAll")
                        .HasColumnType("boolean");

                    b.Property<DateTimeOffset?>("RemovedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("ShowInBar")
                        .HasColumnType("boolean");

                    b.Property<decimal>("SortOrder")
                        .HasPrecision(28, 10)
                        .HasColumnType("numeric(28,10)");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<string>("ViewMode")
                        .IsRequired()
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "RemovedAt", "SortOrder");

                    b.ToTable("note_categories", null, t =>
                        {
                            t.HasCheckConstraint("CK_note_category_enums", "\"Color\" IN ('Gray','Blue','Teal','Green','Red','Pink','Purple') AND \"ViewMode\" IN ('Cards','List')");

                            t.HasCheckConstraint("CK_note_category_name", "length(btrim(\"Name\")) BETWEEN 1 AND 40 AND \"Version\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Support.SupportDay", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<string>("AvailableEnergy")
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)");

                    b.Property<string>("TimeZoneId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("UserId", "LocalDate");

                    b.ToTable("support_days", null, t =>
                        {
                            t.HasCheckConstraint("CK_support_day_version", "\"Version\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Support.UserNote", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid?>("CategoryId")
                        .HasColumnType("uuid");

                    b.Property<string>("ConversionHash")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<Guid?>("ConvertedTaskId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("DeletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Display")
                        .IsRequired()
                        .ValueGeneratedOnAdd()
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)")
                        .HasDefaultValue("Short");

                    b.Property<DateTimeOffset?>("DueAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<DateOnly?>("LocalDate")
                        .HasColumnType("date");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("Text")
                        .IsRequired()
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<string>("TimeZoneId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Title")
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<Guid?>("WorkSessionId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "ConvertedTaskId");

                    b.HasIndex("UserId", "WorkSessionId");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.HasIndex("UserId", "LocalDate", "Id");

                    b.HasIndex("UserId", "CategoryId", "UpdatedAt", "Id");

                    b.HasIndex("UserId", "TaskId", "UpdatedAt", "Id");

                    b.ToTable("user_notes", null, t =>
                        {
                            t.HasCheckConstraint("CK_note_conversion", "(\"ConvertedTaskId\" IS NULL)=(\"ConversionHash\" IS NULL)");

                            t.HasCheckConstraint("CK_note_display", "\"Display\" IN ('Short','Detailed','Toggle') AND ((\"Display\"='Short')=(\"Title\" IS NULL)) AND (\"Title\" IS NULL OR length(btrim(\"Title\")) BETWEEN 1 AND 200)");

                            t.HasCheckConstraint("CK_note_kind", "\"Kind\" IN ('Task','Distraction','NextStep','Daily','General') AND (\"Kind\" NOT IN ('Task','NextStep') OR \"TaskId\" IS NOT NULL) AND ((\"Kind\"='Daily')=(\"LocalDate\" IS NOT NULL))");

                            t.HasCheckConstraint("CK_note_text", "length(btrim(\"Text\"))>0 AND \"Version\">0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.MatrixItem", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("Quadrant")
                        .IsRequired()
                        .HasColumnType("text");

                    b.Property<decimal>("SortOrder")
                        .HasPrecision(28, 10)
                        .HasColumnType("numeric(28,10)");

                    b.HasKey("UserId", "TaskId");

                    b.HasIndex("UserId", "Quadrant", "SortOrder", "TaskId");

                    b.ToTable("matrix_items", null, t =>
                        {
                            t.HasCheckConstraint("CK_matrix_quadrant", "\"Quadrant\" IN ('Inbox','Do','Schedule','Delegate','Eliminate')");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.MatrixState", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .HasColumnType("bigint");

                    b.HasKey("UserId");

                    b.ToTable("matrix_states", null, t =>
                        {
                            t.HasCheckConstraint("CK_matrix_version", "\"Version\" >= 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskDependency", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("PredecessorTaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("SuccessorTaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "SuccessorTaskId");

                    b.HasIndex("UserId", "PredecessorTaskId", "SuccessorTaskId")
                        .IsUnique();

                    b.ToTable("task_dependencies", null, t =>
                        {
                            t.HasCheckConstraint("CK_dependency_self", "\"PredecessorTaskId\" <> \"SuccessorTaskId\"");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskEvent", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("EffectiveAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Payload")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<long>("Sequence")
                        .HasColumnType("bigint");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("TimeZoneId")
                        .ValueGeneratedOnAdd()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Type")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("character varying(50)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TaskId", "EffectiveAt");

                    b.HasIndex("UserId", "TaskId", "Sequence")
                        .IsUnique();

                    b.HasIndex("UserId", "TimeZoneId", "EffectiveAt", "Id");

                    b.ToTable("task_events", null, t =>
                        {
                            t.HasCheckConstraint("CK_task_events_sequence", "\"Sequence\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("AutoCompleteFromChildren")
                        .HasColumnType("boolean");

                    b.Property<bool>("CanSplit")
                        .HasColumnType("boolean");

                    b.Property<Guid?>("CategoryId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("CompletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("CompletionOrigin")
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("DeadlineAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("DeletedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<long?>("DirectEstimatedSeconds")
                        .HasColumnType("bigint");

                    b.Property<bool>("DirectWorkCompleted")
                        .HasColumnType("boolean");

                    b.Property<string>("EnergyDemand")
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)");

                    b.Property<bool>("HasDirectWork")
                        .HasColumnType("boolean");

                    b.Property<Guid?>("ParentTaskId")
                        .HasColumnType("uuid");

                    b.Property<DateOnly?>("PlannedFrom")
                        .HasColumnType("date");

                    b.Property<DateOnly?>("PlannedTo")
                        .HasColumnType("date");

                    b.Property<Guid?>("PoolId")
                        .HasColumnType("uuid");

                    b.Property<string>("Priority")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid?>("ProjectId")
                        .HasColumnType("uuid");

                    b.Property<bool>("RequiredForParent")
                        .HasColumnType("boolean");

                    b.Property<decimal>("SortOrder")
                        .HasPrecision(28, 8)
                        .HasColumnType("numeric(28,8)");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<long?>("TargetBudgetSeconds")
                        .HasColumnType("bigint");

                    b.Property<string>("Title")
                        .IsRequired()
                        .HasMaxLength(300)
                        .HasColumnType("character varying(300)")
                        .UseCollation("adhd_search");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "CategoryId");

                    b.HasIndex("UserId", "PoolId");

                    b.HasIndex("UserId", "ProjectId");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.HasIndex("UserId", "ParentTaskId", "SortOrder", "Id");

                    b.ToTable("tasks", null, t =>
                        {
                            t.HasCheckConstraint("CK_tasks_budget", "\"TargetBudgetSeconds\" IS NULL OR \"TargetBudgetSeconds\" >= 0");

                            t.HasCheckConstraint("CK_tasks_completion", "(\"State\" = 'Completed' AND \"CompletedAt\" IS NOT NULL AND \"CompletionOrigin\" IS NOT NULL) OR (\"State\" <> 'Completed' AND \"CompletedAt\" IS NULL AND \"CompletionOrigin\" IS NULL)");

                            t.HasCheckConstraint("CK_tasks_deleted", "\"DeletedAt\" IS NULL OR \"ArchivedAt\" IS NOT NULL");

                            t.HasCheckConstraint("CK_tasks_direct", "\"HasDirectWork\" OR \"DirectEstimatedSeconds\" IS NULL");

                            t.HasCheckConstraint("CK_tasks_direct_completion", "NOT \"DirectWorkCompleted\" OR \"HasDirectWork\"");

                            t.HasCheckConstraint("CK_tasks_estimate", "\"DirectEstimatedSeconds\" IS NULL OR \"DirectEstimatedSeconds\" >= 0");

                            t.HasCheckConstraint("CK_tasks_parent", "\"ParentTaskId\" IS NULL OR \"ParentTaskId\" <> \"Id\"");

                            t.HasCheckConstraint("CK_tasks_planned_range", "(\"PlannedFrom\" IS NULL AND \"PlannedTo\" IS NULL) OR (\"PlannedFrom\" IS NOT NULL AND \"PlannedTo\" IS NOT NULL AND \"PlannedFrom\" <= \"PlannedTo\")");

                            t.HasCheckConstraint("CK_tasks_title", "length(btrim(\"Title\")) > 0");

                            t.HasCheckConstraint("CK_tasks_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskOrderingPreference", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid>("AfterTaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("BeforeTaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "AfterTaskId");

                    b.HasIndex("UserId", "BeforeTaskId", "AfterTaskId")
                        .IsUnique();

                    b.ToTable("task_ordering_preferences", null, t =>
                        {
                            t.HasCheckConstraint("CK_ordering_self", "\"BeforeTaskId\" <> \"AfterTaskId\"");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskTagLink", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("TagId")
                        .HasColumnType("uuid");

                    b.HasKey("UserId", "TaskId", "TagId");

                    b.HasIndex("UserId", "TagId", "TaskId");

                    b.ToTable("task_tag_links", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.AppUser", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("DisplayName")
                        .IsRequired()
                        .HasMaxLength(320)
                        .HasColumnType("character varying(320)");

                    b.Property<string>("Email")
                        .IsRequired()
                        .HasMaxLength(320)
                        .HasColumnType("character varying(320)");

                    b.Property<string>("NormalizedEmail")
                        .IsRequired()
                        .HasMaxLength(320)
                        .HasColumnType("character varying(320)");

                    b.Property<string>("PasswordHash")
                        .HasColumnType("text");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("NormalizedEmail")
                        .IsUnique();

                    b.ToTable("users", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.AuthSession", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("AdoptedTokenHash")
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("LastSeenAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("RevokedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("UserAgentFamily")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("AdoptedTokenHash")
                        .IsUnique();

                    b.HasIndex("UserId", "RevokedAt");

                    b.ToTable("auth_sessions", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.AuthSessionCutoff", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("ValidAfter")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("UserId");

                    b.ToTable("auth_session_cutoffs", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.ExternalLogin", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("Provider")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<string>("Subject")
                        .IsRequired()
                        .HasMaxLength(255)
                        .HasColumnType("character varying(255)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId");

                    b.HasIndex("Provider", "Subject")
                        .IsUnique();

                    b.ToTable("external_logins", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.PasswordResetRequest", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("ExpiresAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("TokenHash")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<DateTimeOffset?>("UsedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("TokenHash")
                        .IsUnique();

                    b.HasIndex("UserId");

                    b.ToTable("password_reset_requests", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Users.UserPlanningState", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<string>("NotesAllViewMode")
                        .IsRequired()
                        .ValueGeneratedOnAdd()
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)")
                        .HasDefaultValue("Cards");

                    b.Property<string>("NotesTaskViewMode")
                        .IsRequired()
                        .ValueGeneratedOnAdd()
                        .HasMaxLength(10)
                        .HasColumnType("character varying(10)")
                        .HasDefaultValue("List");

                    b.Property<long>("NotesVersion")
                        .HasColumnType("bigint");

                    b.Property<long>("PlanningVersion")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<long>("SpecialDaysVersion")
                        .HasColumnType("bigint");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("UserId");

                    b.ToTable("user_planning_states", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSession", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("EndedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("RecordedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Source")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<DateTimeOffset>("StartedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid?>("StartedRevisionItemId")
                        .HasColumnType("uuid");

                    b.Property<Guid?>("StartedScheduleId")
                        .HasColumnType("uuid");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid?>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("TaskSnapshot")
                        .HasColumnType("jsonb");

                    b.Property<string>("TimeZoneId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId")
                        .IsUnique()
                        .HasFilter("\"State\" = 'Running'");

                    b.HasIndex("UserId", "TaskId")
                        .IsUnique()
                        .HasFilter("\"State\" IN ('Running','Paused') AND \"TaskId\" IS NOT NULL");

                    b.HasIndex("UserId", "StartedAt", "Id");

                    b.HasIndex("UserId", "StartedScheduleId", "StartedRevisionItemId");

                    b.ToTable("work_sessions", null, t =>
                        {
                            t.HasCheckConstraint("CK_work_plan_context", "(\"StartedScheduleId\" IS NULL AND \"StartedRevisionItemId\" IS NULL) OR (\"TaskId\" IS NOT NULL AND \"StartedScheduleId\" IS NOT NULL AND \"StartedRevisionItemId\" IS NOT NULL)");

                            t.HasCheckConstraint("CK_work_state", "(\"State\" IN ('Running','Paused') AND \"EndedAt\" IS NULL) OR (\"State\" IN ('Finished','Canceled') AND \"EndedAt\" IS NOT NULL)");

                            t.HasCheckConstraint("CK_work_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");

                            t.HasCheckConstraint("CK_work_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSessionCorrection", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<string>("NewSession")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<string>("NewValues")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<string>("PreviousSession")
                        .HasColumnType("jsonb");

                    b.Property<string>("PreviousValues")
                        .HasColumnType("jsonb");

                    b.Property<string>("Reason")
                        .IsRequired()
                        .HasMaxLength(2000)
                        .HasColumnType("character varying(2000)");

                    b.Property<Guid>("SegmentId")
                        .HasColumnType("uuid");

                    b.Property<long>("Sequence")
                        .HasColumnType("bigint");

                    b.Property<Guid>("SessionId")
                        .HasColumnType("uuid");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "SessionId", "SegmentId");

                    b.HasIndex("UserId", "SessionId", "Sequence")
                        .IsUnique();

                    b.ToTable("work_session_corrections", null, t =>
                        {
                            t.HasCheckConstraint("CK_work_correction_reason", "length(btrim(\"Reason\")) > 0");

                            t.HasCheckConstraint("CK_work_correction_sequence", "\"Sequence\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSessionSegment", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("EndedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("IsVoided")
                        .HasColumnType("boolean");

                    b.Property<Guid>("SessionId")
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset>("StartedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId")
                        .IsUnique()
                        .HasFilter("\"EndedAt\" IS NULL AND NOT \"IsVoided\"");

                    b.HasIndex("UserId", "SessionId", "StartedAt");

                    b.ToTable("work_session_segments", null, t =>
                        {
                            t.HasCheckConstraint("CK_segment_time", "\"EndedAt\" IS NULL OR \"EndedAt\" >= \"StartedAt\"");

                            t.HasCheckConstraint("CK_segment_version", "\"Version\" > 0");

                            t.HasCheckConstraint("CK_segment_void", "NOT \"IsVoided\" OR \"EndedAt\" IS NOT NULL");
                        });
                });

            modelBuilder.Entity("Adhd.Infrastructure.ClientErrors.ClientErrorReport", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<string>("BrowserFamily")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<string>("BuildId")
                        .IsRequired()
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<string>("Message")
                        .IsRequired()
                        .HasMaxLength(500)
                        .HasColumnType("character varying(500)");

                    b.Property<DateTimeOffset>("OccurredAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("ReceivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Route")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("ReceivedAt");

                    b.HasIndex("UserId", "ReceivedAt");

                    b.ToTable("client_error_reports", (string)null);
                });

            modelBuilder.Entity("Adhd.Infrastructure.Persistence.DatabaseMetadata", b =>
                {
                    b.Property<string>("Key")
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Value")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.HasKey("Key");

                    b.ToTable("app_metadata", (string)null);

                    b.HasData(
                        new
                        {
                            Key = "schema",
                            Value = "1"
                        });
                });

            modelBuilder.Entity("Adhd.Infrastructure.Preferences.UserPreferencesRecord", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<string>("Payload")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("UserId");

                    b.ToTable("user_preferences", null, t =>
                        {
                            t.HasCheckConstraint("CK_preferences_object", "jsonb_typeof(\"Payload\") = 'object'");

                            t.HasCheckConstraint("CK_preferences_version", "\"Version\" > 0");
                        });
                });

            modelBuilder.Entity("Adhd.Infrastructure.Scheduling.SchedulingProposalRecord", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<Guid?>("AppliedChangeSetId")
                        .HasColumnType("uuid");

                    b.Property<string>("AppliedResult")
                        .HasColumnType("jsonb");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset>("ExpiresAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Input")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<string>("InputHash")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<long>("InputPlanningVersion")
                        .HasColumnType("bigint");

                    b.Property<string>("Kind")
                        .IsRequired()
                        .ValueGeneratedOnAdd()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)")
                        .HasDefaultValue("Day");

                    b.Property<DateOnly>("LocalDate")
                        .HasColumnType("date");

                    b.Property<string>("PublicResult")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.Property<Guid?>("ReversesChangeSetId")
                        .HasColumnType("uuid");

                    b.Property<string>("Status")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("Status", "ExpiresAt");

                    b.HasIndex("UserId", "ReversesChangeSetId")
                        .IsUnique()
                        .HasFilter("\"Status\" = 'Applied' AND \"ReversesChangeSetId\" IS NOT NULL");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.ToTable("scheduling_proposals", null, t =>
                        {
                            t.HasCheckConstraint("CK_proposal_expiry", "\"CreatedAt\" < \"ExpiresAt\"");

                            t.HasCheckConstraint("CK_proposal_kind", "\"Kind\" IN ('Day','Distribution')");

                            t.HasCheckConstraint("CK_proposal_status", "\"Status\" IN ('Pending','Applied','Expired')");

                            t.HasCheckConstraint("CK_proposal_version", "\"InputPlanningVersion\" >= 0");
                        });
                });

            modelBuilder.Entity("Adhd.Infrastructure.Work.IdempotencyRecord", b =>
                {
                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<string>("Scope")
                        .HasMaxLength(60)
                        .HasColumnType("character varying(60)");

                    b.Property<string>("Key")
                        .HasMaxLength(128)
                        .HasColumnType("character varying(128)");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("RequestHash")
                        .IsRequired()
                        .HasMaxLength(64)
                        .HasColumnType("character varying(64)");

                    b.Property<string>("Response")
                        .IsRequired()
                        .HasColumnType("jsonb");

                    b.HasKey("UserId", "Scope", "Key");

                    b.ToTable("idempotency_records", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskCategory", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskPool", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskProject", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Collections.TaskTag", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Focus.FocusPreset", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Focus.FocusSession", b =>
                {
                    b.HasOne("Adhd.Domain.Focus.FocusPreset", null)
                        .WithMany()
                        .HasForeignKey("UserId", "PresetId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Focus.FocusSession", null)
                        .WithMany()
                        .HasForeignKey("UserId", "PreviousFocusId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Work.WorkSession", null)
                        .WithMany()
                        .HasForeignKey("UserId", "WorkSessionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.JobEffectReceipt", b =>
                {
                    b.HasOne("Adhd.Domain.Jobs.OutboxMessage", null)
                        .WithMany()
                        .HasForeignKey("UserId", "OutboxId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.NotificationIntent", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.DailyPlan", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DailyPlanId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "RevisionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.OutboxMessage", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Jobs.ReminderWork", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.DailyPlan", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DailyPlanId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "RevisionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.CustomReminder", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.NotificationPreferences", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.PushDelivery", b =>
                {
                    b.HasOne("Adhd.Domain.Jobs.NotificationIntent", null)
                        .WithMany()
                        .HasForeignKey("UserId", "NotificationId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Notifications.PushSubscriptionRecord", null)
                        .WithMany()
                        .HasForeignKey("UserId", "SubscriptionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Notifications.PushSubscriptionRecord", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Planning.DailyPlan", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "Id", "BaselineRevisionId")
                        .HasPrincipalKey("UserId", "DailyPlanId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "Id", "CurrentRevisionId")
                        .HasPrincipalKey("UserId", "DailyPlanId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.DayItem", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevision", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.DailyPlan", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DailyPlanId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DailyPlanId", "PreviousRevisionId")
                        .HasPrincipalKey("UserId", "DailyPlanId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionChange", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.DayItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DayItemId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "RevisionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.TaskSchedule", null)
                        .WithMany()
                        .HasForeignKey("UserId", "ScheduleId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionDayItem", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.DayItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DayItemId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "RevisionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Planning.PlanRevisionItem", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.PlanRevision", null)
                        .WithMany()
                        .HasForeignKey("UserId", "RevisionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.TaskSchedule", null)
                        .WithMany()
                        .HasForeignKey("UserId", "ScheduleId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Planning.TaskSchedule", b =>
                {
                    b.HasOne("Adhd.Domain.Planning.DailyPlan", null)
                        .WithMany()
                        .HasForeignKey("UserId", "DailyPlanId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.TaskSchedule", null)
                        .WithMany()
                        .HasForeignKey("UserId", "OriginScheduleId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceDefinition", b =>
                {
                    b.HasOne("Adhd.Domain.Recurrence.RecurrenceTemplate", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TemplateId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceOccurrence", b =>
                {
                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Recurrence.RecurrenceTemplate", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TemplateId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Recurrence.RecurrenceDefinition", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TemplateId", "AppliedDefinitionId")
                        .HasPrincipalKey("UserId", "TemplateId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Recurrence.RecurrenceDefinition", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TemplateId", "DefinitionId")
                        .HasPrincipalKey("UserId", "TemplateId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired()
                        .HasConstraintName("FK_recurrence_occurrences_recurrence_definitions_UserId_Templ~1");
                });

            modelBuilder.Entity("Adhd.Domain.Recurrence.RecurrenceTemplate", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.SpecialDays.SpecialDay", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Support.DailyCriticalTask", b =>
                {
                    b.HasOne("Adhd.Domain.Support.SupportDay", null)
                        .WithMany()
                        .HasForeignKey("UserId", "LocalDate")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Support.NoteCategory", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Support.SupportDay", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Support.UserNote", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Support.NoteCategory", null)
                        .WithMany()
                        .HasForeignKey("UserId", "CategoryId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "ConvertedTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Work.WorkSession", null)
                        .WithMany()
                        .HasForeignKey("UserId", "WorkSessionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.MatrixItem", b =>
                {
                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.MatrixState", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskDependency", b =>
                {
                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "PredecessorTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "SuccessorTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskEvent", b =>
                {
                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskItem", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Collections.TaskCategory", null)
                        .WithMany()
                        .HasForeignKey("UserId", "CategoryId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "ParentTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Collections.TaskPool", null)
                        .WithMany()
                        .HasForeignKey("UserId", "PoolId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Collections.TaskProject", null)
                        .WithMany()
                        .HasForeignKey("UserId", "ProjectId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskOrderingPreference", b =>
                {
                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "AfterTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "BeforeTaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskTagLink", b =>
                {
                    b.HasOne("Adhd.Domain.Collections.TaskTag", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TagId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Users.AuthSession", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Users.AuthSessionCutoff", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithOne()
                        .HasForeignKey("Adhd.Domain.Users.AuthSessionCutoff", "UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Users.ExternalLogin", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Users.PasswordResetRequest", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Users.UserPlanningState", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithOne()
                        .HasForeignKey("Adhd.Domain.Users.UserPlanningState", "UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSession", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();

                    b.HasOne("Adhd.Domain.Planning.TaskSchedule", null)
                        .WithMany()
                        .HasForeignKey("UserId", "StartedScheduleId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Tasks.TaskItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "TaskId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);

                    b.HasOne("Adhd.Domain.Planning.PlanRevisionItem", null)
                        .WithMany()
                        .HasForeignKey("UserId", "StartedScheduleId", "StartedRevisionItemId")
                        .HasPrincipalKey("UserId", "ScheduleId", "Id")
                        .OnDelete(DeleteBehavior.Restrict);
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSessionCorrection", b =>
                {
                    b.HasOne("Adhd.Domain.Work.WorkSessionSegment", null)
                        .WithMany()
                        .HasForeignKey("UserId", "SessionId", "SegmentId")
                        .HasPrincipalKey("UserId", "SessionId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Domain.Work.WorkSessionSegment", b =>
                {
                    b.HasOne("Adhd.Domain.Work.WorkSession", null)
                        .WithMany()
                        .HasForeignKey("UserId", "SessionId")
                        .HasPrincipalKey("UserId", "Id")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Infrastructure.ClientErrors.ClientErrorReport", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Cascade)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Infrastructure.Preferences.UserPreferencesRecord", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithOne()
                        .HasForeignKey("Adhd.Infrastructure.Preferences.UserPreferencesRecord", "UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Infrastructure.Scheduling.SchedulingProposalRecord", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });

            modelBuilder.Entity("Adhd.Infrastructure.Work.IdempotencyRecord", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });
#pragma warning restore 612, 618
        }
    }
}
