using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Preferences;
using Adhd.Domain.Collections;
using Adhd.Domain.Tasks;

namespace Adhd.IntegrationTests;

public sealed class MigrationUpgradeTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task JobsSchemaUpgradeKeepsIntentIdentityAndBootstrapsDeliveryWithoutRewritingEventInstant()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddPersistentJobs", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = DateTimeOffset.UtcNow; var user = new AppUser { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now }; db.Users.Add(user); await db.SaveChangesAsync();
        var intentId = Guid.NewGuid(); var sourceId = Guid.NewGuid(); var key = "old-identity";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO notification_intents ("Id","UserId","SourceKey","Kind","SourceId","SourceVersion","OccurredAt","CreatedAt","State")
            VALUES ({intentId},{user.Id},{key},'FocusTarget',{sourceId},1,{now},{now},'Pending')
            """);
        await db.Database.MigrateAsync(); var intent = await db.NotificationIntents.SingleAsync(x => x.Id == intentId); Assert.Equal(1, intent.Version); Assert.Equal(key, intent.SourceKey); Assert.Equal(now.ToUnixTimeMilliseconds(), intent.OccurredAt.ToUnixTimeMilliseconds());
        Assert.True(await db.Outbox.AnyAsync(x => x.UserId == user.Id && x.SourceId == intentId && x.Kind == "NotificationReady")); Assert.Empty(await db.PushSubscriptions.Where(x => x.UserId == user.Id).ToArrayAsync()); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task RecurrenceSchemaUpgradeBootstrapsDurableJobsAndCreatesPinnedQuartzTablesWithoutLosingData()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddRecurrence", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = DateTimeOffset.UtcNow; var user = new AppUser { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now }; db.Users.Add(user);
        // Güncel modelde yeni kolonlar var. Eski satırı doğrudan SQL ile eski şemaya ekle.
        await db.SaveChangesAsync(); await InsertLegacyPlanningState(db,user.Id,now); var task = new TaskItem { Id = Guid.NewGuid(), UserId = user.Id, Title = "Existing deadline", CreatedAt = now, UpdatedAt = now, DeadlineAt = now.AddDays(1) }; await InsertLegacyTask(db, task);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE tasks SET \"DeadlineAt\" = {task.DeadlineAt} WHERE \"Id\" = {task.Id}"); var template = new Adhd.Domain.Recurrence.RecurrenceTemplate { Id = Guid.NewGuid(), UserId = user.Id, CreatedAt = now, UpdatedAt = now }; db.RecurrenceTemplates.Add(template);
        db.RecurrenceDefinitions.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, TemplateId = template.Id, Number = 1, EffectiveFrom = new(2026, 10, 15), CreatedAt = now }); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); Assert.Equal(task.DeadlineAt!.Value.ToUnixTimeMilliseconds(), (await db.Tasks.SingleAsync(x => x.Id == task.Id)).DeadlineAt!.Value.ToUnixTimeMilliseconds());
        Assert.True(await db.Outbox.AnyAsync(x => x.UserId == user.Id && x.SourceId == task.Id && x.Kind == "TaskChanged")); Assert.True(await db.Outbox.AnyAsync(x => x.UserId == user.Id && x.SourceId == template.Id && x.Kind == "RecurrenceChanged"));
        Assert.Equal(15, await db.Database.SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'qrtz_%'").SingleAsync()); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task SupportSchemaUpgradePreservesNotesEnergyAndCriticalDayWhileAddingRecurrence()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddSupportTools", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero); var date = new DateOnly(2026, 10, 15); var user = new AppUser { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now }; db.Users.Add(user);
        await db.SaveChangesAsync(); var task = new TaskItem { Id = Guid.NewGuid(), UserId = user.Id, Title = "Keep support", CreatedAt = now, UpdatedAt = now, EnergyDemand = Adhd.Domain.Support.EnergyLevel.High }; await InsertLegacyTask(db, task);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE tasks SET \"EnergyDemand\" = 'High' WHERE \"Id\" = {task.Id}");
        var note = new Adhd.Domain.Support.UserNote { Id = Guid.NewGuid(), UserId = user.Id, TaskId = task.Id, Kind = Adhd.Domain.Support.NoteKind.NextStep, Text = "Keep next step", CreatedAt = now, UpdatedAt = now }; await InsertLegacyNote(db, note);
        db.SupportDays.Add(new() { UserId = user.Id, LocalDate = date, AvailableEnergy = Adhd.Domain.Support.EnergyLevel.Low }); db.CriticalTasks.Add(new() { UserId = user.Id, LocalDate = date, TaskId = task.Id, Slot = 1 }); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); Assert.Equal("Keep next step", (await db.Notes.SingleAsync(x => x.Id == note.Id)).Text); Assert.Equal(Adhd.Domain.Support.EnergyLevel.High, (await db.Tasks.SingleAsync(x => x.Id == task.Id)).EnergyDemand); Assert.Equal(task.Id, (await db.CriticalTasks.SingleAsync(x => x.UserId == user.Id)).TaskId); Assert.Empty(await db.RecurrenceTemplates.Where(x => x.UserId == user.Id).ToArrayAsync()); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    private static Task InsertLegacyTask(PlannerDbContext db, TaskItem task) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO tasks ("Id","UserId","Title","State","Priority","CanSplit","HasDirectWork","DirectWorkCompleted","RequiredForParent","SortOrder","CreatedAt","UpdatedAt","Version")
        VALUES ({task.Id},{task.UserId},{task.Title},'Pending','Normal',true,true,false,true,1024,{task.CreatedAt},{task.UpdatedAt},1)
        """);
    [Fact]
    public async Task FocusSchemaUpgradePreservesFocusSnapshotAndDefaultsSupportsWithoutInventingEnergy()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddFocusSessions", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero); var user = new AppUser { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now }; db.Users.Add(user); db.Preferences.Add(new() { UserId = user.Id, Version = 1, Payload = "{\"TimeZoneId\":\"Europe/Istanbul\"}" }); await db.SaveChangesAsync();
        var task = new TaskItem { Id = Guid.NewGuid(), UserId = user.Id, Title = "Before support", CreatedAt = now, UpdatedAt = now }; await InsertLegacyTask(db, task);
        var work = new Adhd.Domain.Work.WorkSession { Id = Guid.NewGuid(), UserId = user.Id, TaskId = task.Id, StartedAt = now, RecordedAt = now }; db.WorkSessions.Add(work);
        var focus = new Adhd.Domain.Focus.FocusSession { Id = Guid.NewGuid(), UserId = user.Id, WorkSessionId = work.Id, StartedAt = now, Settings = "{\"workSeconds\":2100,\"shortBreakSeconds\":420}" }; db.FocusSessions.Add(focus); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); Assert.Contains("2100", (await db.FocusSessions.SingleAsync(x => x.Id == focus.Id)).Settings); Assert.Null((await db.Tasks.SingleAsync(x => x.Id == task.Id)).EnergyDemand);
        var prefs = await new PreferencesStore(db, new MutableClock()).ReadAsync(user.Id, default); Assert.True(prefs.Values.SupportEnabled); Assert.Empty(await db.Notes.Where(x => x.UserId == user.Id).ToArrayAsync()); Assert.Empty(await db.SupportDays.Where(x => x.UserId == user.Id).ToArrayAsync()); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task PreFocusSchemaUpgradePreservesGeneralWorkAndEventZoneTrigger()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddHistoricalEventZone", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero); var user = new AppUser { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now }; db.Users.Add(user);
        var work = new Adhd.Domain.Work.WorkSession { Id = Guid.NewGuid(), UserId = user.Id, TaskId = null, StartedAt = now, RecordedAt = now }; db.WorkSessions.Add(work); db.WorkSegments.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, SessionId = work.Id, StartedAt = now }); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); var preserved = await db.WorkSessions.SingleAsync(x => x.Id == work.Id); Assert.Null(preserved.TaskId); Assert.Equal(Adhd.Domain.Work.WorkState.Running, preserved.State); Assert.Empty(await db.FocusSessions.Where(x => x.UserId == user.Id).ToArrayAsync());
        Assert.Equal(300m, Adhd.Domain.Work.WorkTime.Seconds(await db.WorkSegments.Where(x => x.UserId == user.Id).ToArrayAsync(), now.AddMinutes(5)));
        var task = new TaskItem { Id = Guid.NewGuid(), UserId = user.Id, Title = "After focus upgrade", CreatedAt = now, UpdatedAt = now }; db.Tasks.Add(task);
        var taskEvent = new TaskEvent { Id = Guid.NewGuid(), UserId = user.Id, TaskId = task.Id, Type = "Created", Sequence = 1, EffectiveAt = now }; db.TaskEvents.Add(taskEvent); await db.SaveChangesAsync(); Assert.Equal("Europe/Istanbul", taskEvent.TimeZoneId); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task EventZoneUpgradeKeepsUnknownLegacyZoneAndCapturesNewEventsFromPreferences()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddDistributionProposals", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(previous);
        var now = new DateTimeOffset(2026, 10, 15, 8, 0, 0, TimeSpan.Zero); var user = new AppUser { Id = Guid.CreateVersion7(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = now };
        db.Users.Add(user);
        var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = user.Id, Title = "Legacy", CreatedAt = now, UpdatedAt = now };
        db.Preferences.Add(new() { UserId = user.Id, Version = 1, Payload = "{\"TimeZoneId\":\"Europe/Berlin\"}" }); await db.SaveChangesAsync(); await InsertLegacyPlanningState(db,user.Id,now);
        await InsertLegacyTask(db, task);
        var legacyId = Guid.CreateVersion7(); var payload = "{\"after\":{\"State\":\"Completed\",\"Title\":\"Legacy\"},\"before\":{\"State\":\"Pending\"}}";
        await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO task_events (\"Id\",\"UserId\",\"TaskId\",\"Type\",\"Sequence\",\"EffectiveAt\",\"Payload\") VALUES ({legacyId},{user.Id},{task.Id},'Completed',1,{now},{payload}::jsonb)");
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); Assert.Null((await db.TaskEvents.SingleAsync(x => x.Id == legacyId)).TimeZoneId);
        var fresh = new TaskEvent { Id = Guid.CreateVersion7(), UserId = user.Id, TaskId = task.Id, Type = "Updated", Sequence = 2, EffectiveAt = now.AddSeconds(1), Payload = "{\"after\":{\"State\":\"Pending\"}}" }; db.TaskEvents.Add(fresh); await db.SaveChangesAsync(); Assert.Equal("Europe/Berlin", fresh.TimeZoneId);
        var clock = new MutableClock { Now = now.AddHours(2) }; var calendar = new Adhd.Infrastructure.Calendar.CalendarStore(db, new PreferencesStore(db, clock), clock);
        var day = await calendar.DayAsync(user.Id, new(2026, 10, 15), new(), default); Assert.Equal(1, day.LegacyZoneCompletionCount); Assert.Equal(0, day.Summary.CompletedTaskCount); Assert.Empty(day.Completions.Items);
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task UndoSchemaProposalsBecomeDayKindWithoutLosingReceiptData()
    {
        await using var db = fixture.CreateContext(); var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddPlanUndo", StringComparison.Ordinal)); await db.GetService<IMigrator>().MigrateAsync(previous);
        var user = new AppUser { Id = Guid.CreateVersion7(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = DateTimeOffset.UtcNow }; db.Users.Add(user); await db.SaveChangesAsync(); var id = Guid.CreateVersion7(); var now = DateTimeOffset.UtcNow; var expiry = now.AddMinutes(2); var date = new DateOnly(2026, 10, 15); var hash = new string('B', 64);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO scheduling_proposals ("Id","UserId","LocalDate","InputPlanningVersion","CreatedAt","ExpiresAt","InputHash","Input","PublicResult","Status")
            VALUES ({id},{user.Id},{date},0,{now},{expiry},{hash},{"{\"schema\":\"undo-old\"}"}::jsonb,{"{}"}::jsonb,'Pending')
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); var row = await db.SchedulingProposals.SingleAsync(x => x.Id == id); Assert.Equal("Day", row.Kind); Assert.Equal(hash, row.InputHash); Assert.Contains("undo-old", row.Input); Assert.Null(row.ReversesChangeSetId); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task PreviousProposalSchemaPreservesPendingProposalAndAddsNullableUndoMetadata()
    {
        await using var db = fixture.CreateContext();
        var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddSchedulingProposals", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(previous); var user = new AppUser { Id = Guid.CreateVersion7(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = DateTimeOffset.UtcNow }; db.Users.Add(user); await db.SaveChangesAsync();
        var proposal = Guid.CreateVersion7(); var now = DateTimeOffset.UtcNow; var expiry = now.AddMinutes(2); var date = new DateOnly(2026, 10, 15); var hash = new string('A', 64);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO scheduling_proposals ("Id","UserId","LocalDate","InputPlanningVersion","CreatedAt","ExpiresAt","InputHash","Input","PublicResult","Status")
            VALUES ({proposal},{user.Id},{date},0,{now},{expiry},{hash},{"{\"schema\":\"old\"}"}::jsonb,{"{}"}::jsonb,'Pending')
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear(); var preserved = await db.SchedulingProposals.SingleAsync(x => x.Id == proposal);
        Assert.Null(preserved.ReversesChangeSetId); Assert.Equal("Pending", preserved.Status); Assert.Equal(hash, preserved.InputHash); Assert.Contains("old", preserved.Input); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task ManualPlanAndOriginalWorkLinkSurviveProposalSchemaUpgrade()
    {
        await using var db = fixture.CreateContext();
        var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddManualPlanning", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(previous);
        var user = new AppUser { Id = Guid.CreateVersion7(), Email = $"{Guid.NewGuid():N}@example.test", NormalizedEmail = Guid.NewGuid().ToString(), CreatedAt = DateTimeOffset.UtcNow };
        db.Users.Add(user); var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = user.Id, Title = "Old plan", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        await db.SaveChangesAsync(); await InsertLegacyTask(db, task);
        var plan = Guid.CreateVersion7(); var schedule = Guid.CreateVersion7(); var revision = Guid.CreateVersion7(); var item = Guid.CreateVersion7(); var session = Guid.CreateVersion7(); var now = new DateTimeOffset(2026, 10, 15, 6, 0, 0, TimeSpan.Zero); var end = now.AddHours(1); var day = new DateOnly(2026, 10, 15);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO daily_plans ("Id","UserId","LocalDate","TimeZoneId","Version") VALUES ({plan},{user.Id},{day},'Europe/Istanbul',1);
            INSERT INTO task_schedules ("Id","UserId","DailyPlanId","TaskId","Kind","State","StartsAt","EndsAt","IsFixed","IsLocked","Version")
                VALUES ({schedule},{user.Id},{plan},{task.Id},'Work','Planned',{now},{end},true,false,1);
            INSERT INTO plan_revisions ("Id","UserId","DailyPlanId","Number","ChangeSetId","Trigger","Reason","CreatedAt","EffectiveAt","AlgorithmVersion","SnapshotSchemaVersion")
                VALUES ({revision},{user.Id},{plan},1,{Guid.CreateVersion7()},'Manual','Old revision',{now},{now},'manual-v1',1);
            INSERT INTO plan_revision_items ("Id","UserId","RevisionId","ScheduleId","Snapshot") VALUES ({item},{user.Id},{revision},{schedule},{"{}"}::jsonb);
            UPDATE daily_plans SET "CurrentRevisionId"={revision},"BaselineRevisionId"={revision} WHERE "Id"={plan};
            INSERT INTO work_sessions ("Id","UserId","TaskId","State","Source","StartedAt","RecordedAt","TimeZoneId","Version","StartedScheduleId","StartedRevisionItemId")
                VALUES ({session},{user.Id},{task.Id},'Paused','Timer',{now},{now},'Europe/Istanbul',1,{schedule},{item});
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        var block = await db.TaskSchedules.SingleAsync(x => x.Id == schedule); Assert.False(block.IsAutomatic); Assert.True(block.IsFixed);
        Assert.Equal(revision, (await db.DailyPlans.SingleAsync(x => x.Id == plan)).BaselineRevisionId);
        Assert.Equal(item, (await db.WorkSessions.SingleAsync(x => x.Id == session)).StartedRevisionItemId);
        Assert.Equal("{}", (await db.PlanRevisionItems.SingleAsync(x => x.Id == item)).Snapshot);
        Assert.False(await db.SchedulingProposals.AnyAsync(x => x.UserId == user.Id)); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
    [Fact]
    public async Task InitialSchemaDataSurvivesUpgradeToAuthenticationSchema()
    {
        await using var db = fixture.CreateContext();
        var initial = db.Database.GetMigrations().Single(x => x.EndsWith("_InitialSchema", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(initial);
        db.Metadata.Add(new DatabaseMetadata { Key = "upgrade-proof", Value = "keep-me" });
        await db.SaveChangesAsync();
        await db.Database.MigrateAsync();
        db.ChangeTracker.Clear();
        Assert.Equal("keep-me", (await db.Metadata.SingleAsync(x => x.Key == "upgrade-proof")).Value);
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Empty(await db.Users.ToListAsync());
        // Mevcut bir hesapla önceki kimlik şemasından yükseltmeyi dene.
        var previous = db.Database.GetMigrations().Single(x => x.EndsWith("_AddGoogleExternalLogins", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(previous);
        var user = new AppUser { Id = Guid.CreateVersion7(), Email = "upgrade@example.test", NormalizedEmail = "UPGRADE@EXAMPLE.TEST", DisplayName = "Keep user", PasswordHash = "existing-hash", CreatedAt = DateTimeOffset.UtcNow };
        db.Users.Add(user); await db.SaveChangesAsync();
        var recovery = db.Database.GetMigrations().Single(x => x.EndsWith("_AddPasswordRecovery", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(recovery);
        var reset = new PasswordResetRequest { Id = Guid.CreateVersion7(), UserId = user.Id, TokenHash = new string('A', 64), CreatedAt = DateTimeOffset.UtcNow, ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(30) };
        db.PasswordResets.Add(reset); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal("existing-hash", (await db.Users.SingleAsync(x => x.Id == user.Id)).PasswordHash);
        Assert.Equal(reset.TokenHash, (await db.PasswordResets.SingleAsync(x => x.Id == reset.Id)).TokenHash);
        Assert.Empty(await db.Preferences.ToListAsync());
        var preferences = db.Database.GetMigrations().Single(x => x.EndsWith("_AddPlanningPreferences", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(preferences);
        db.Preferences.Add(new UserPreferencesRecord { UserId = user.Id, Version = 1, Payload = "{\"TimeZoneId\":\"Europe/Istanbul\"}" });
        await db.SaveChangesAsync(); await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Contains("Europe/Istanbul", (await db.Preferences.SingleAsync(x => x.UserId == user.Id)).Payload);
        Assert.Equal(reset.TokenHash, (await db.PasswordResets.SingleAsync(x => x.Id == reset.Id)).TokenHash);
        Assert.Empty(await db.Tasks.ToListAsync());
        var flatTasks = db.Database.GetMigrations().Single(x => x.EndsWith("_AddTasksAndEvents", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(flatTasks);
        var taskId = Guid.CreateVersion7(); var now = DateTimeOffset.UtcNow;
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO tasks ("Id","UserId","Title","State","Priority","CanSplit","DirectEstimatedSeconds","CreatedAt","UpdatedAt","Version")
            VALUES ({taskId},{user.Id},'Preserve old direct estimate','Pending','Normal',true,1200,{now},{now},1)
            """);
        var createdEvent = Guid.CreateVersion7(); var updatedEvent = Guid.CreateVersion7();
        var firstPayload = "{\"after\":{\"Version\":1,\"Title\":\"Original\"}}";
        var secondPayload = "{\"after\":{\"Version\":2,\"Title\":\"Preserve old direct estimate\"}}";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO task_events ("Id","UserId","TaskId","Type","EffectiveAt","Payload") VALUES
            ({createdEvent},{user.Id},{taskId},'Created',{now},{firstPayload}::jsonb),
            ({updatedEvent},{user.Id},{taskId},'Updated',{now},{secondPayload}::jsonb)
            """);
        var completedId = Guid.CreateVersion7(); var completedTime = now.AddSeconds(1);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO tasks ("Id","UserId","Title","State","Priority","CanSplit","CreatedAt","UpdatedAt","Version")
            VALUES ({completedId},{user.Id},'Old completed work','Completed','Normal',true,{completedTime},{completedTime},1)
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        var preserved = await db.Tasks.SingleAsync(x => x.Id == taskId);
        Assert.True(preserved.HasDirectWork); Assert.Equal(1200, preserved.DirectEstimatedSeconds);
        Assert.Equal(1024, preserved.SortOrder); Assert.Null(preserved.ParentTaskId);
        Assert.True(preserved.RequiredForParent); Assert.Equal(2, preserved.Version);
        var migratedSequences = await db.TaskEvents.Where(x => x.TaskId == taskId).OrderBy(x => x.Sequence).Select(x => x.Sequence).ToArrayAsync();
        Assert.Equal([1L, 2L], migratedSequences);
        var completed = await db.Tasks.SingleAsync(x => x.Id == completedId);
        Assert.True(completed.DirectWorkCompleted); Assert.Equal(Adhd.Domain.Tasks.CompletionOrigin.Manual, completed.CompletionOrigin);
        Assert.Equal(completedTime.ToUnixTimeMilliseconds(), completed.CompletedAt!.Value.ToUnixTimeMilliseconds());
        var lifecycle = db.Database.GetMigrations().Single(x => x.EndsWith("_AddTaskLifecycle", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(lifecycle);
        preserved.Title = "Before relations upgrade"; await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal("Before relations upgrade", (await db.Tasks.SingleAsync(x => x.Id == taskId)).Title);
        Assert.Empty(await db.TaskDependencies.ToArrayAsync()); Assert.Empty(await db.TaskOrderingPreferences.ToArrayAsync());
        Assert.Equal(2, await db.TaskEvents.CountAsync(x => x.TaskId == taskId));
        var relationsSchema = db.Database.GetMigrations().Single(x => x.EndsWith("_AddTaskRelations", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(relationsSchema);
        var relation = new TaskDependency { Id = Guid.CreateVersion7(), UserId = user.Id, PredecessorTaskId = taskId, SuccessorTaskId = completedId };
        db.TaskDependencies.Add(relation); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.True(await db.TaskDependencies.AnyAsync(x => x.Id == relation.Id)); Assert.Empty(await db.Projects.ToArrayAsync());
        var collectionsSchema = db.Database.GetMigrations().Single(x => x.EndsWith("_AddNamedCollections", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(collectionsSchema);
        var project = new TaskProject { Id = Guid.CreateVersion7(), UserId = user.Id, Name = "Üst İş IŞIK", CreatedAt = now, UpdatedAt = now };
        var tag = new TaskTag { Id = Guid.CreateVersion7(), UserId = user.Id, Name = "Keep tag", CreatedAt = now, UpdatedAt = now };
        db.Projects.Add(project); db.Tags.Add(tag); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal(project.Name, (await db.Projects.SingleAsync(x => x.Id == project.Id)).Name);
        Assert.Equal(tag.Name, (await db.Tags.SingleAsync(x => x.Id == tag.Id)).Name);
        Assert.Null((await db.Tasks.SingleAsync(x => x.Id == taskId)).ProjectId);
        Assert.Empty(await db.TaskTagLinks.ToArrayAsync()); Assert.True(await db.TaskDependencies.AnyAsync(x => x.Id == relation.Id));
        var preWork = db.Database.GetMigrations().Single(x => x.EndsWith("_DefineTurkishSearchCollation", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(preWork); db.ChangeTracker.Clear();
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE tasks SET \"ProjectId\"={project.Id} WHERE \"Id\"={taskId}");
        db.TaskTagLinks.Add(new() { UserId = user.Id, TaskId = taskId, TagId = tag.Id }); await db.SaveChangesAsync();
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal(project.Id, (await db.Tasks.SingleAsync(x => x.Id == taskId)).ProjectId);
        Assert.Single(await db.TaskTagLinks.ToArrayAsync()); Assert.Empty(await db.WorkSessions.ToArrayAsync()); Assert.Empty(await db.WorkSegments.ToArrayAsync());
        var workSchema = db.Database.GetMigrations().Single(x => x.EndsWith("_AddWorkSessions", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(workSchema); db.ChangeTracker.Clear();
        var oldSessionId = Guid.CreateVersion7(); var oldSegmentId = Guid.CreateVersion7(); var workStart = now.AddHours(-1); var workEnd = workStart.AddMinutes(20);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO work_sessions ("Id","UserId","TaskId","State","Source","StartedAt","EndedAt","TimeZoneId","Version")
            VALUES ({oldSessionId},{user.Id},{taskId},'Paused','Timer',{workStart},NULL,'Europe/Istanbul',2);
            INSERT INTO work_session_segments ("Id","UserId","SessionId","StartedAt","EndedAt","IsVoided","Version")
            VALUES ({oldSegmentId},{user.Id},{oldSessionId},{workStart},{workEnd},false,2);
            """);
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        var oldWork = await db.WorkSessions.SingleAsync(x => x.Id == oldSessionId);
        Assert.Equal(oldWork.StartedAt, oldWork.RecordedAt); Assert.Equal(Adhd.Domain.Work.WorkState.Paused, oldWork.State);
        Assert.Equal(1200m, Adhd.Domain.Work.WorkTime.Seconds(await db.WorkSegments.Where(x => x.SessionId == oldSessionId).ToArrayAsync(), now));
        Assert.Empty(await db.WorkCorrections.ToArrayAsync());
        var correctionSchema = db.Database.GetMigrations().Single(x => x.EndsWith("_AddWorkCorrections", StringComparison.Ordinal));
        await db.GetService<IMigrator>().MigrateAsync(correctionSchema); db.ChangeTracker.Clear();
        var journalId = Guid.CreateVersion7();
        db.WorkCorrections.Add(new() { Id = journalId, UserId = user.Id, SessionId = oldSessionId, SegmentId = oldSegmentId, Sequence = 3,
            Kind = "Adjusted", Reason = "Before planning upgrade", CreatedAt = now,
            PreviousValues = "{\"isVoided\":false}", NewValues = "{\"isVoided\":false}", PreviousSession = "{\"state\":\"Paused\"}", NewSession = "{\"state\":\"Paused\"}" });
        await db.SaveChangesAsync(); await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        oldWork = await db.WorkSessions.SingleAsync(x => x.Id == oldSessionId);
        Assert.Null(oldWork.StartedScheduleId); Assert.Null(oldWork.StartedRevisionItemId);
        Assert.Equal("Before planning upgrade", (await db.WorkCorrections.SingleAsync(x => x.Id == journalId)).Reason);
        Assert.Empty(await db.DailyPlans.ToArrayAsync()); Assert.Empty(await db.TaskSchedules.ToArrayAsync()); Assert.Empty(await db.PlanRevisions.ToArrayAsync());
    }
    private static Task<int> InsertLegacyNote(PlannerDbContext db, Adhd.Domain.Support.UserNote n) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO user_notes ("Id","UserId","TaskId","Kind","Text","TimeZoneId","CreatedAt","UpdatedAt","Version")
        VALUES ({n.Id},{n.UserId},{n.TaskId},{n.Kind.ToString()},{n.Text},{n.TimeZoneId},{n.CreatedAt},{n.UpdatedAt},1)
        """);
    // EF yeni sayaçları biliyor. Yükseltmeden önce veriyi gerçek eski şemaya ekle
    private static Task<int> InsertLegacyPlanningState(PlannerDbContext db,Guid user,DateTimeOffset now) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO user_planning_states ("UserId","PlanningVersion","UpdatedAt") VALUES ({user},0,{now})
        """);

    [Fact]
    public async Task ReadVersionUpgradePreservesExistingTaskNoteAndPlanningVersionAndStartsBothCountersAtZero()
    {
        await using var db=fixture.CreateContext();var migrations=db.Database.GetMigrations().ToArray();var target=Array.FindIndex(migrations,x=>x.EndsWith("_FrontendReadVersions",StringComparison.Ordinal));
        Assert.True(target>0);await db.GetService<IMigrator>().MigrateAsync(migrations[target-1]);
        var now=DateTimeOffset.UtcNow;var user=new AppUser {Id=Guid.NewGuid(),Email=$"{Guid.NewGuid():N}@example.test",NormalizedEmail=Guid.NewGuid().ToString(),CreatedAt=now};
        db.Users.Add(user);await db.SaveChangesAsync();await InsertLegacyPlanningState(db,user.Id,now);
        await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE user_planning_states SET \"PlanningVersion\"=17 WHERE \"UserId\"={user.Id}");
        var task=new TaskItem {Id=Guid.NewGuid(),UserId=user.Id,Title="Existing read upgrade task",CreatedAt=now,UpdatedAt=now};db.Tasks.Add(task);
        var noteId=Guid.NewGuid();await db.SaveChangesAsync();await InsertLegacyNote(db,new() {Id=noteId,UserId=user.Id,TaskId=task.Id,Text="Existing private note",CreatedAt=now,UpdatedAt=now});
        await db.Database.MigrateAsync();db.ChangeTracker.Clear();
        var state=await db.PlanningStates.SingleAsync(x=>x.UserId==user.Id);Assert.Equal(17,state.PlanningVersion);Assert.Equal(0,state.NotesVersion);Assert.Equal(0,state.SpecialDaysVersion);
        Assert.Equal(task.Title,(await db.Tasks.SingleAsync(x=>x.Id==task.Id)).Title);Assert.Equal("Existing private note",(await db.Notes.SingleAsync(x=>x.Id==noteId)).Text);Assert.Equal(task.Id,(await db.Notes.SingleAsync(x=>x.Id==noteId)).TaskId);Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }

}
