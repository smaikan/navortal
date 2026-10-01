using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Domain.Work;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : IWorkStore, IWorkCorrectionStore, IImmediateWorkStore, Adhd.Application.Focus.IFocusStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    public async Task<StartWorkResult> StartAsync(Guid userId, StartWork command, string key, CancellationToken ct)
    {
        var taskId = command.TaskId;
        ValidateKey(key);
        if (command.ScheduleId.HasValue != command.ScheduleVersion.HasValue) throw new UseCaseException(ErrorKind.Validation, "schedule_version_required", "Planlı başlangıç scheduleId ve scheduleVersion birlikte gerektirir.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(command.ScheduleId is null ? taskId.ToString("D") : JsonSerializer.Serialize(command, Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var previous = await db.IdempotencyRecords.SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "work-start" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw Conflict("idempotency_conflict", "Bu anahtar başka bir komutta kullanılmış.");
            return new(ReadReplay(previous.Response), true);
        }
        var task = await Eligible(userId, taskId, ct);
        await CheckNoRunning(userId, ct);
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.TaskId == taskId && x.State == WorkState.Paused, ct))
            throw Conflict("session_paused", "Bu görevin duraklatılmış oturumuna devam edin.");
        var now = clock.GetUtcNow(); await CheckClock(userId, now, ct);
        var session = new WorkSession
        {
            Id = Guid.CreateVersion7(), UserId = userId, TaskId = taskId, StartedAt = now, RecordedAt = now,
            TimeZoneId = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId
        };
        if (command.ScheduleId is { } scheduleId)
        {
            var block = await db.TaskSchedules.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == scheduleId, ct)
                ?? throw new UseCaseException(ErrorKind.NotFound, "schedule_not_found", "Blok bulunamadı.");
            if (block.TaskId != taskId || block.Kind != Adhd.Domain.Planning.ScheduleKind.Work) throw Conflict("schedule_task_mismatch", "Blok bu görevin çalışma bloğu değil.");
            if (block.State != Adhd.Domain.Planning.ScheduleState.Planned || block.Version != command.ScheduleVersion) throw Conflict("schedule_stale", "Plan bloğu değişmiş; güncel kaydı alın.");
            var item = await (from i in db.PlanRevisionItems join p in db.DailyPlans on i.RevisionId equals p.CurrentRevisionId
                              where i.UserId == userId && p.UserId == userId && i.ScheduleId == scheduleId select i).SingleAsync(ct);
            session.StartedScheduleId = scheduleId; session.StartedRevisionItemId = item.Id;
        }
        TouchTask(task, TaskState.InProgress, now, "WorkStarted", session.Id);
        session.TaskSnapshot = JsonSerializer.Serialize(await Snapshot(task, state.PlanningVersion, ct), Json);
        db.WorkSessions.Add(session); var segment = Open(session, now); db.WorkSegments.Add(segment);
        state.PlanningVersion++; state.UpdatedAt = now;
        var view = View(session, 0, now);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "work-start", Key = key, RequestHash = hash, CreatedAt = now, Response = JsonSerializer.Serialize(view, Json) });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(view, false);
    }
    public async Task<WorkView> TransitionAsync(Guid userId, Guid id, long version, string action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var session = await Find(userId, id, ct);
        if (session.Version != version) throw Conflict("version_conflict", "Oturum değişmiş; güncel kaydı alın.");
        var now = clock.GetUtcNow();
        var segments = await db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == id).ToListAsync(ct);
        var desired = action switch { "pause" => WorkState.Paused, "resume" => WorkState.Running, "finish" => WorkState.Finished, _ => throw new ArgumentOutOfRangeException(nameof(action)) };
        if (session.State == desired) return View(session, Measured(segments, now), now);
        if (session.State is WorkState.Finished or WorkState.Canceled) throw Conflict("session_finished", "Bitmiş oturuma devam edilemez.");
        if (now < session.StartedAt || segments.Any(x => now < (x.EndedAt ?? x.StartedAt))) throw Conflict("server_clock_conflict", "Sunucu zamanı önceki kayıttan geride; tekrar deneyin.");
        TaskItem? task = session.TaskId is { } taskId ? await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == taskId, ct) : null;
        if (desired == WorkState.Running)
        {
            if (task is not null) _ = await Eligible(userId, task.Id, ct);
            await CheckNoRunning(userId, ct); await CheckClock(userId, now, ct);
            var segment = Open(session, now); db.WorkSegments.Add(segment); segments.Add(segment);
        }
        else
        {
            foreach (var segment in segments.Where(x => !x.IsVoided && x.EndedAt is null)) { segment.EndedAt = now; segment.Version++; }
            if (desired == WorkState.Finished) session.EndedAt = now;
        }
        session.State = desired; session.Version++;
        if (task is not null) TouchTask(task, desired == WorkState.Running ? TaskState.InProgress : TaskState.Paused, now, "Work" + (action == "pause" ? "Paused" : action == "resume" ? "Resumed" : "Finished"), session.Id);
        state.PlanningVersion++; state.UpdatedAt = now;
        await Adhd.Infrastructure.Focus.FocusLifecycle.SyncWork(db, session, segments, now, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(session, Measured(segments, now), now);
    }
    private async Task<TaskItem> Eligible(Guid userId, Guid taskId, CancellationToken ct)
    {
        var nodes = await db.Tasks.Where(x => x.UserId == userId).ToArrayAsync(ct);
        var selected = nodes.SingleOrDefault(x => x.Id == taskId) ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        var dependencies = await db.TaskDependencies.Where(x => x.UserId == userId).ToArrayAsync(ct);
        var result = TaskGraphRules.CanStart(selected, nodes, dependencies);
        if (!result.CanStart) throw Conflict(result.Reasons[0], "Görev başlatılamıyor: " + string.Join(", ", result.Reasons));
        return selected;
    }
    private async Task CheckNoRunning(Guid userId, CancellationToken ct)
    {
        if (await db.WorkSessions.AnyAsync(x => x.UserId == userId && x.State == WorkState.Running, ct)) throw Conflict("work_already_running", "Önce açık çalışmayı duraklatın veya bitirin.");
    }
    private async Task CheckClock(Guid userId, DateTimeOffset now, CancellationToken ct)
    {
        if (await db.WorkSegments.AnyAsync(x => x.UserId == userId && !x.IsVoided && x.EndedAt > now, ct)) throw Conflict("server_clock_conflict", "Sunucu zamanı önceki kayıttan geride; tekrar deneyin.");
    }
    internal async Task<TaskAtStart> Snapshot(TaskItem task, long planningVersion, CancellationToken ct)
    {
        var nodes = await db.Tasks.AsNoTracking().Where(x => x.UserId == task.UserId).ToDictionaryAsync(x => x.Id, ct);
        var ancestors = new List<NamedSnapshot>(); var parent = task.ParentTaskId;
        while (parent is { } id && nodes.TryGetValue(id, out var node)) { ancestors.Add(new(id, node.Title)); parent = node.ParentTaskId; }
        ancestors.Reverse();
        var project = await db.Projects.AsNoTracking().Where(x => x.UserId == task.UserId && x.Id == task.ProjectId).Select(x => new NamedSnapshot(x.Id, x.Name)).SingleOrDefaultAsync(ct);
        var pool = await db.Pools.AsNoTracking().Where(x => x.UserId == task.UserId && x.Id == task.PoolId).Select(x => new NamedSnapshot(x.Id, x.Name)).SingleOrDefaultAsync(ct);
        var category = await db.Categories.AsNoTracking().Where(x => x.UserId == task.UserId && x.Id == task.CategoryId).Select(x => new NamedSnapshot(x.Id, x.Name)).SingleOrDefaultAsync(ct);
        var tags = await (from link in db.TaskTagLinks join tag in db.Tags on new { link.UserId, Id = link.TagId } equals new { tag.UserId, tag.Id }
                          where link.UserId == task.UserId && link.TaskId == task.Id orderby tag.Id select new NamedSnapshot(tag.Id, tag.Name)).ToArrayAsync(ct);
        return new(2, task.Id, task.Version, task.Title, ancestors.ToArray(), project, pool, category, tags, planningVersion, clock.GetUtcNow());
    }
    private static WorkSessionSegment Open(WorkSession session, DateTimeOffset now) => new() { Id = Guid.CreateVersion7(), UserId = session.UserId, SessionId = session.Id, StartedAt = now };
    private void TouchTask(TaskItem task, TaskState desired, DateTimeOffset now, string kind, Guid sessionId)
    {
        var before = TaskStore.View(task); task.State = desired; task.Version++; task.UpdatedAt = now;
        TaskHistory.Append(db, task, kind, before, new { sessionId });
    }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<WorkSession> Find(Guid userId, Guid id, CancellationToken ct) => await db.WorkSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "session_not_found", "Oturum bulunamadı.");
    private static WorkView ReadReplay(string response)
    {
        var view = JsonSerializer.Deserialize<WorkView>(response, Json)!;
        return view.RecordedAt == default ? view with { RecordedAt = view.StartedAt } : view;
    }
    private static decimal Measured(IEnumerable<WorkSessionSegment> segments, DateTimeOffset now)
    {
        try { return WorkTime.Seconds(segments, now); }
        catch (ArgumentOutOfRangeException) { throw Conflict("server_clock_conflict", "Sunucu zamanı önceki kayıttan geride; tekrar deneyin."); }
    }
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    private static WorkView View(WorkSession s, decimal seconds, DateTimeOffset now) => new(s.Id, s.TaskId, s.State, s.Source, s.StartedAt, s.EndedAt, s.TimeZoneId,
        s.TaskSnapshot is null ? null : JsonSerializer.Deserialize<TaskAtStart>(s.TaskSnapshot, Json), s.Version, seconds, now, s.RecordedAt, s.StartedScheduleId, s.StartedRevisionItemId);
}
