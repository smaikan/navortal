// Bu dosyayı EF Core oluşturdu.
using System;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(PlannerDbContext))]
    [Migration("20261015091803_AddTasksAndEvents")]
    partial class AddTasksAndEvents
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.13")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

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

                    b.Property<Guid>("TaskId")
                        .HasColumnType("uuid");

                    b.Property<string>("Type")
                        .IsRequired()
                        .HasMaxLength(50)
                        .HasColumnType("character varying(50)");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "TaskId", "EffectiveAt");

                    b.ToTable("task_events", (string)null);
                });

            modelBuilder.Entity("Adhd.Domain.Tasks.TaskItem", b =>
                {
                    b.Property<Guid>("Id")
                        .ValueGeneratedOnAdd()
                        .HasColumnType("uuid");

                    b.Property<DateTimeOffset?>("ArchivedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<bool>("CanSplit")
                        .HasColumnType("boolean");

                    b.Property<DateTimeOffset>("CreatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<DateTimeOffset?>("DeadlineAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<string>("Description")
                        .HasMaxLength(10000)
                        .HasColumnType("character varying(10000)");

                    b.Property<long?>("DirectEstimatedSeconds")
                        .HasColumnType("bigint");

                    b.Property<string>("Priority")
                        .IsRequired()
                        .HasMaxLength(20)
                        .HasColumnType("character varying(20)");

                    b.Property<string>("State")
                        .IsRequired()
                        .HasMaxLength(30)
                        .HasColumnType("character varying(30)");

                    b.Property<string>("Title")
                        .IsRequired()
                        .HasMaxLength(300)
                        .HasColumnType("character varying(300)");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.Property<Guid>("UserId")
                        .HasColumnType("uuid");

                    b.Property<long>("Version")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.HasKey("Id");

                    b.HasIndex("UserId", "CreatedAt", "Id");

                    b.ToTable("tasks", null, t =>
                        {
                            t.HasCheckConstraint("CK_tasks_estimate", "\"DirectEstimatedSeconds\" IS NULL OR \"DirectEstimatedSeconds\" >= 0");

                            t.HasCheckConstraint("CK_tasks_title", "length(btrim(\"Title\")) > 0");

                            t.HasCheckConstraint("CK_tasks_version", "\"Version\" > 0");
                        });
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

                    b.Property<long>("PlanningVersion")
                        .IsConcurrencyToken()
                        .HasColumnType("bigint");

                    b.Property<DateTimeOffset>("UpdatedAt")
                        .HasColumnType("timestamp with time zone");

                    b.HasKey("UserId");

                    b.ToTable("user_planning_states", (string)null);
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

            modelBuilder.Entity("Adhd.Infrastructure.Preferences.UserPreferencesRecord", b =>
                {
                    b.HasOne("Adhd.Domain.Users.AppUser", null)
                        .WithOne()
                        .HasForeignKey("Adhd.Infrastructure.Preferences.UserPreferencesRecord", "UserId")
                        .OnDelete(DeleteBehavior.Restrict)
                        .IsRequired();
                });
#pragma warning restore 612, 618
        }
    }
}
