using Microsoft.EntityFrameworkCore;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Preferences;
using Adhd.Domain.Tasks;
using Adhd.Domain.Collections;

namespace Adhd.Infrastructure.Persistence;

public sealed class PlannerDbContext(DbContextOptions<PlannerDbContext> options, TimeProvider? clock = null) : DbContext(options)
{
    // Eski şema testi veya kontrollü içe aktarma outbox öncesi satır ekleyebilir
    public bool SuppressOutboxCapture { get; set; }
    public DbSet<MatrixItem> MatrixItems => Set<MatrixItem>();
    public DbSet<MatrixState> MatrixStates => Set<MatrixState>();
    public DbSet<Adhd.Domain.Notifications.NotificationPreferences> NotificationPreferences => Set<Adhd.Domain.Notifications.NotificationPreferences>();
    public DbSet<Adhd.Domain.Notifications.PushSubscriptionRecord> PushSubscriptions => Set<Adhd.Domain.Notifications.PushSubscriptionRecord>();
    public DbSet<Adhd.Domain.Notifications.PushDelivery> PushDeliveries => Set<Adhd.Domain.Notifications.PushDelivery>();
    public DbSet<Adhd.Domain.Notifications.CustomReminder> CustomReminders => Set<Adhd.Domain.Notifications.CustomReminder>();
    public DbSet<Adhd.Domain.Jobs.OutboxMessage> Outbox => Set<Adhd.Domain.Jobs.OutboxMessage>();
    public DbSet<Adhd.Domain.Jobs.JobEffectReceipt> JobEffects => Set<Adhd.Domain.Jobs.JobEffectReceipt>();
    public DbSet<Adhd.Domain.Jobs.ReminderWork> ReminderWork => Set<Adhd.Domain.Jobs.ReminderWork>();
    public DbSet<Adhd.Domain.Jobs.NotificationIntent> NotificationIntents => Set<Adhd.Domain.Jobs.NotificationIntent>();
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        if (!SuppressOutboxCapture) Adhd.Infrastructure.Jobs.OutboxCapture.Append(this, (clock ?? TimeProvider.System).GetUtcNow());
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }
    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        if (!SuppressOutboxCapture) Adhd.Infrastructure.Jobs.OutboxCapture.Append(this, (clock ?? TimeProvider.System).GetUtcNow());
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }
    public DbSet<Adhd.Domain.Recurrence.RecurrenceTemplate> RecurrenceTemplates => Set<Adhd.Domain.Recurrence.RecurrenceTemplate>();
    public DbSet<Adhd.Domain.Recurrence.RecurrenceDefinition> RecurrenceDefinitions => Set<Adhd.Domain.Recurrence.RecurrenceDefinition>();
    public DbSet<Adhd.Domain.Recurrence.RecurrenceOccurrence> RecurrenceOccurrences => Set<Adhd.Domain.Recurrence.RecurrenceOccurrence>();
    public DbSet<Adhd.Domain.Support.UserNote> Notes => Set<Adhd.Domain.Support.UserNote>();
    public DbSet<Adhd.Domain.Support.NoteCategory> NoteCategories => Set<Adhd.Domain.Support.NoteCategory>();
    public DbSet<Adhd.Domain.Support.SupportDay> SupportDays => Set<Adhd.Domain.Support.SupportDay>();
    public DbSet<Adhd.Domain.Support.DailyCriticalTask> CriticalTasks => Set<Adhd.Domain.Support.DailyCriticalTask>();
    public DbSet<Adhd.Domain.Focus.FocusPreset> FocusPresets => Set<Adhd.Domain.Focus.FocusPreset>();
    public DbSet<Adhd.Domain.Focus.FocusSession> FocusSessions => Set<Adhd.Domain.Focus.FocusSession>();
    public DbSet<Adhd.Infrastructure.Scheduling.SchedulingProposalRecord> SchedulingProposals => Set<Adhd.Infrastructure.Scheduling.SchedulingProposalRecord>();
    public DbSet<Adhd.Domain.Planning.DailyPlan> DailyPlans => Set<Adhd.Domain.Planning.DailyPlan>();
    public DbSet<Adhd.Domain.Planning.TaskSchedule> TaskSchedules => Set<Adhd.Domain.Planning.TaskSchedule>();
    public DbSet<Adhd.Domain.Planning.DayItem> DayItems => Set<Adhd.Domain.Planning.DayItem>();
    public DbSet<Adhd.Domain.Planning.PlanRevision> PlanRevisions => Set<Adhd.Domain.Planning.PlanRevision>();
    public DbSet<Adhd.Domain.Planning.PlanRevisionItem> PlanRevisionItems => Set<Adhd.Domain.Planning.PlanRevisionItem>();
    public DbSet<Adhd.Domain.Planning.PlanRevisionChange> PlanRevisionChanges => Set<Adhd.Domain.Planning.PlanRevisionChange>();
    public DbSet<Adhd.Domain.Planning.PlanRevisionDayItem> PlanRevisionDayItems => Set<Adhd.Domain.Planning.PlanRevisionDayItem>();
    public DbSet<Adhd.Domain.Work.WorkSession> WorkSessions => Set<Adhd.Domain.Work.WorkSession>();
    public DbSet<Adhd.Domain.Work.WorkSessionCorrection> WorkCorrections => Set<Adhd.Domain.Work.WorkSessionCorrection>();
    public DbSet<Adhd.Domain.Work.WorkSessionSegment> WorkSegments => Set<Adhd.Domain.Work.WorkSessionSegment>();
    public DbSet<Adhd.Infrastructure.Work.IdempotencyRecord> IdempotencyRecords => Set<Adhd.Infrastructure.Work.IdempotencyRecord>();
    public DbSet<DatabaseMetadata> Metadata => Set<DatabaseMetadata>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<UserPlanningState> PlanningStates => Set<UserPlanningState>();
    public DbSet<ExternalLogin> ExternalLogins => Set<ExternalLogin>();
    public DbSet<PasswordResetRequest> PasswordResets => Set<PasswordResetRequest>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<AuthSessionCutoff> AuthSessionCutoffs => Set<AuthSessionCutoff>();
    public DbSet<Adhd.Infrastructure.ClientErrors.ClientErrorReport> ClientErrors => Set<Adhd.Infrastructure.ClientErrors.ClientErrorReport>();
    public DbSet<Adhd.Domain.SpecialDays.SpecialDay> SpecialDays => Set<Adhd.Domain.SpecialDays.SpecialDay>();
    public DbSet<UserPreferencesRecord> Preferences => Set<UserPreferencesRecord>();
    public DbSet<TaskItem> Tasks => Set<TaskItem>();
    public DbSet<TaskEvent> TaskEvents => Set<TaskEvent>();
    public DbSet<TaskDependency> TaskDependencies => Set<TaskDependency>();
    public DbSet<TaskOrderingPreference> TaskOrderingPreferences => Set<TaskOrderingPreference>();
    public DbSet<TaskProject> Projects => Set<TaskProject>();
    public DbSet<TaskPool> Pools => Set<TaskPool>();
    public DbSet<TaskCategory> Categories => Set<TaskCategory>();
    public DbSet<TaskTag> Tags => Set<TaskTag>();
    public DbSet<TaskTagLink> TaskTagLinks => Set<TaskTagLink>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        Adhd.Infrastructure.Jobs.JobPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Notifications.NotificationPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Recurrence.RecurrencePersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Support.SupportPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Focus.FocusPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Work.WorkPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Planning.PlanningPersistence.Configure(modelBuilder);
        Adhd.Infrastructure.Scheduling.SchedulingPersistence.Configure(modelBuilder);
        modelBuilder.HasCollation("adhd_search", locale: "tr", provider: "icu", deterministic: true);
        modelBuilder.Entity<MatrixState>(b =>
        {
            b.ToTable("matrix_states", t => t.HasCheckConstraint("CK_matrix_version", "\"Version\" >= 0")); b.HasKey(x => x.UserId);
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<MatrixItem>(b =>
        {
            b.ToTable("matrix_items", t => t.HasCheckConstraint("CK_matrix_quadrant", "\"Quadrant\" IN ('Inbox','Do','Schedule','Delegate','Eliminate')"));
            b.HasKey(x => new { x.UserId, x.TaskId }); b.Property(x => x.Quadrant).HasConversion<string>(); b.Property(x => x.SortOrder).HasPrecision(28, 10);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.UserId, x.Quadrant, x.SortOrder, x.TaskId });
        });
        ConfigureResource<TaskProject>(modelBuilder, "task_projects");
        ConfigureResource<TaskPool>(modelBuilder, "task_pools");
        ConfigureResource<TaskCategory>(modelBuilder, "task_categories");
        ConfigureResource<TaskTag>(modelBuilder, "task_tags");
        modelBuilder.Entity<TaskTagLink>(b =>
        {
            b.ToTable("task_tag_links"); b.HasKey(x => new { x.UserId, x.TaskId, x.TagId });
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskTag>().WithMany().HasForeignKey(x => new { x.UserId, x.TagId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.TagId, x.TaskId });
        });
        modelBuilder.Entity<TaskDependency>(b =>
        {
            b.ToTable("task_dependencies", t => t.HasCheckConstraint("CK_dependency_self", "\"PredecessorTaskId\" <> \"SuccessorTaskId\""));
            b.HasKey(x => x.Id);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.PredecessorTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.SuccessorTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.PredecessorTaskId, x.SuccessorTaskId }).IsUnique();
        });
        modelBuilder.Entity<TaskOrderingPreference>(b =>
        {
            b.ToTable("task_ordering_preferences", t => t.HasCheckConstraint("CK_ordering_self", "\"BeforeTaskId\" <> \"AfterTaskId\""));
            b.HasKey(x => x.Id);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.BeforeTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.AfterTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.BeforeTaskId, x.AfterTaskId }).IsUnique();
        });
        modelBuilder.Entity<TaskItem>(b =>
        {
            b.ToTable("tasks", t =>
            {
                t.HasCheckConstraint("CK_tasks_title", "length(btrim(\"Title\")) > 0");
                t.HasCheckConstraint("CK_tasks_estimate", "\"DirectEstimatedSeconds\" IS NULL OR \"DirectEstimatedSeconds\" >= 0");
                t.HasCheckConstraint("CK_tasks_version", "\"Version\" > 0");
                t.HasCheckConstraint("CK_tasks_planned_range", "(\"PlannedFrom\" IS NULL AND \"PlannedTo\" IS NULL) OR (\"PlannedFrom\" IS NOT NULL AND \"PlannedTo\" IS NOT NULL AND \"PlannedFrom\" <= \"PlannedTo\")");
                t.HasCheckConstraint("CK_tasks_deleted", "\"DeletedAt\" IS NULL OR \"ArchivedAt\" IS NOT NULL");
                t.HasCheckConstraint("CK_tasks_parent", "\"ParentTaskId\" IS NULL OR \"ParentTaskId\" <> \"Id\"");
                t.HasCheckConstraint("CK_tasks_budget", "\"TargetBudgetSeconds\" IS NULL OR \"TargetBudgetSeconds\" >= 0");
                t.HasCheckConstraint("CK_tasks_direct", "\"HasDirectWork\" OR \"DirectEstimatedSeconds\" IS NULL");
                t.HasCheckConstraint("CK_tasks_direct_completion", "NOT \"DirectWorkCompleted\" OR \"HasDirectWork\"");
                t.HasCheckConstraint("CK_tasks_completion", "(\"State\" = 'Completed' AND \"CompletedAt\" IS NOT NULL AND \"CompletionOrigin\" IS NOT NULL) OR (\"State\" <> 'Completed' AND \"CompletedAt\" IS NULL AND \"CompletionOrigin\" IS NULL)");
            });
            b.HasKey(x => x.Id); b.HasAlternateKey(x => new { x.UserId, x.Id });
            b.Property(x => x.Title).HasMaxLength(300).UseCollation("adhd_search"); b.Property(x => x.Description).HasMaxLength(10000);
            b.Property(x => x.State).HasConversion<string>().HasMaxLength(30);
            b.Property(x => x.Priority).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.CompletionOrigin).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.SortOrder).HasPrecision(28, 8);
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.ParentTaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.CreatedAt, x.Id });
            b.HasOne<TaskProject>().WithMany().HasForeignKey(x => new { x.UserId, x.ProjectId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskPool>().WithMany().HasForeignKey(x => new { x.UserId, x.PoolId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<TaskCategory>().WithMany().HasForeignKey(x => new { x.UserId, x.CategoryId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.ParentTaskId, x.SortOrder, x.Id });
        });
        modelBuilder.Entity<TaskEvent>(b =>
        {
            b.ToTable("task_events", t => t.HasCheckConstraint("CK_task_events_sequence", "\"Sequence\" > 0")); b.HasKey(x => x.Id);
            b.Property(x => x.Type).HasMaxLength(50); b.Property(x => x.Payload).HasColumnType("jsonb");
            b.Property(x => x.TimeZoneId).HasMaxLength(100).ValueGeneratedOnAdd();
            b.HasIndex(x => new { x.UserId, x.TimeZoneId, x.EffectiveAt, x.Id });
            b.HasOne<TaskItem>().WithMany().HasForeignKey(x => new { x.UserId, x.TaskId }).HasPrincipalKey(x => new { x.UserId, x.Id }).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.UserId, x.TaskId, x.EffectiveAt });
            b.HasIndex(x => new { x.UserId, x.TaskId, x.Sequence }).IsUnique();
        });
        modelBuilder.Entity<UserPreferencesRecord>(b =>
        {
            b.ToTable("user_preferences", t =>
            {
                t.HasCheckConstraint("CK_preferences_object", "jsonb_typeof(\"Payload\") = 'object'");
                t.HasCheckConstraint("CK_preferences_version", "\"Version\" > 0");
            });
            b.HasKey(x => x.UserId); b.Property(x => x.Version).IsConcurrencyToken();
            b.Property(x => x.Payload).HasColumnType("jsonb");
            b.HasOne<AppUser>().WithOne().HasForeignKey<UserPreferencesRecord>(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<PasswordResetRequest>(b =>
        {
            b.ToTable("password_reset_requests"); b.HasKey(x => x.Id);
            b.Property(x => x.TokenHash).HasMaxLength(64);
            b.HasIndex(x => x.TokenHash).IsUnique();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Adhd.Domain.SpecialDays.SpecialDay>(b =>
        {
            b.ToTable("special_days", t =>
            {
                t.HasCheckConstraint("CK_special_day_month", "\"Month\" BETWEEN 1 AND 12");
                t.HasCheckConstraint("CK_special_day_day", "\"Day\" BETWEEN 1 AND 31");
                t.HasCheckConstraint("CK_special_day_once_year", "\"Recurrence\" <> 'Once' OR \"Year\" IS NOT NULL");
                t.HasCheckConstraint("CK_special_day_version", "\"Version\" > 0");
            });
            b.HasKey(x => x.Id); b.HasIndex(x => new { x.UserId, x.DeletedAt, x.Month, x.Day });
            b.Property(x => x.Title).HasMaxLength(120);
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20); b.Property(x => x.Recurrence).HasConversion<string>().HasMaxLength(20);
            b.Property(x => x.Reminder).HasConversion<string>().HasMaxLength(20); b.Property(x => x.Version).IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<Adhd.Infrastructure.ClientErrors.ClientErrorReport>(b =>
        {
            b.ToTable("client_error_reports"); b.HasKey(x => x.Id); b.HasIndex(x => new { x.UserId, x.ReceivedAt }); b.HasIndex(x => x.ReceivedAt);
            b.Property(x => x.Message).HasMaxLength(500); b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(30);
            b.Property(x => x.Route).HasMaxLength(200); b.Property(x => x.BuildId).HasMaxLength(100); b.Property(x => x.BrowserFamily).HasMaxLength(20);
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<AuthSessionCutoff>(b =>
        {
            b.ToTable("auth_session_cutoffs"); b.HasKey(x => x.UserId);
            b.HasOne<AppUser>().WithOne().HasForeignKey<AuthSessionCutoff>(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AuthSession>(b =>
        {
            b.ToTable("auth_sessions"); b.HasKey(x => x.Id);
            b.Property(x => x.UserAgentFamily).HasMaxLength(20);
            b.Property(x => x.AdoptedTokenHash).HasMaxLength(64);
            b.HasIndex(x => x.AdoptedTokenHash).IsUnique();
            b.HasIndex(x => new { x.UserId, x.RevokedAt });
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<ExternalLogin>(b =>
        {
            b.ToTable("external_logins"); b.HasKey(x => x.Id);
            b.Property(x => x.Provider).HasMaxLength(30);
            b.Property(x => x.Subject).HasMaxLength(255);
            b.HasIndex(x => new { x.Provider, x.Subject }).IsUnique();
            b.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        });
        modelBuilder.Entity<AppUser>(b =>
        {
            b.ToTable("users"); b.HasKey(x => x.Id);
            b.Property(x => x.Email).HasMaxLength(320);
            b.Property(x => x.NormalizedEmail).HasMaxLength(320);
            b.Property(x => x.DisplayName).HasMaxLength(320);
            b.HasIndex(x => x.NormalizedEmail).IsUnique();
            b.Property(x => x.Version).IsConcurrencyToken();
        });
        modelBuilder.Entity<UserPlanningState>(b =>
        {
            b.ToTable("user_planning_states"); b.HasKey(x => x.UserId);
            b.HasOne<AppUser>().WithOne().HasForeignKey<UserPlanningState>(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.Property(x => x.PlanningVersion).IsConcurrencyToken();
            b.Property(x => x.NotesAllViewMode).HasConversion<string>().HasMaxLength(10).HasDefaultValue(Adhd.Domain.Support.NoteViewMode.Cards).HasSentinel((Adhd.Domain.Support.NoteViewMode)(-1));
            b.Property(x => x.NotesTaskViewMode).HasConversion<string>().HasMaxLength(10).HasDefaultValue(Adhd.Domain.Support.NoteViewMode.List).HasSentinel((Adhd.Domain.Support.NoteViewMode)(-1));
        });
        modelBuilder.Entity<DatabaseMetadata>(b =>
        {
            b.ToTable("app_metadata");
            b.HasKey(x => x.Key);
            b.Property(x => x.Key).HasMaxLength(100);
            b.Property(x => x.Value).HasMaxLength(200);
            b.HasData(new DatabaseMetadata { Key = "schema", Value = "1" });
        });
    }
    private static void ConfigureResource<T>(ModelBuilder builder, string table) where T : class, INamedResource
    {
        builder.Entity<T>(b =>
        {
            b.ToTable(table, t => { t.HasCheckConstraint($"CK_{table}_name", "length(btrim(\"Name\")) > 0"); t.HasCheckConstraint($"CK_{table}_version", "\"Version\" > 0"); });
            b.HasKey("Id"); b.HasAlternateKey("UserId", "Id");
            b.Property<string>("Name").HasMaxLength(200).UseCollation("adhd_search"); b.Property<string?>("Description").HasMaxLength(10000);
            b.Property<long>("Version").IsConcurrencyToken();
            b.HasOne<AppUser>().WithMany().HasForeignKey("UserId").OnDelete(DeleteBehavior.Restrict);
            b.HasIndex("UserId", "Name", "Id");
        });
    }
}

public sealed class DatabaseMetadata
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "";
}
