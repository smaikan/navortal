using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Work;
using Adhd.Domain.Planning;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public async Task<ImmediateWorkStart> StartNowAsync(Guid userId, StartNowCommand command, string key, CancellationToken ct)
    {
        ValidateKey(key);
        if (command.ExpectedPlanningVersion < 0 || command.ExpectedSessionId.HasValue != command.ExpectedSessionVersion.HasValue || command.ExpectedSessionVersion < 1
            || command.RemainingTaskIds is { Length: > 1000 } || command.RemainingTaskIds?.Distinct().Count() != command.RemainingTaskIds?.Length)
            throw new UseCaseException(ErrorKind.Validation, "start_now_invalid", "Geçerli plan/oturum sürümü ve benzersiz görevler gerekli.");
        command = command with { RemainingTaskIds = (command.RemainingTaskIds ?? []).Order().ToArray() };
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command, Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "work-start-now" && x.Key == key, ct);
        if (replay is not null)
        {
            if (replay.RequestHash != hash) throw Conflict("idempotency_conflict", "Bu anahtar başka bir komutta kullanılmış.");
            return new(JsonSerializer.Deserialize<ImmediateWorkReceipt>(replay.Response, Json)!, true);
        }
        if (state.PlanningVersion != command.ExpectedPlanningVersion) throw Conflict("planning_version_conflict", "Plan veya çalışma değişmiş; güncel durumu alın.");
        var running = await db.WorkSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.State == WorkState.Running, ct);
        if (running?.Id != command.ExpectedSessionId || running?.Version != command.ExpectedSessionVersion) throw Conflict("session_conflict", "Beklenen aktif oturum değişmiş; güncel durumu alın.");
        if (running?.TaskId == command.TaskId) throw Conflict("work_already_running", "Bu görev zaten çalışıyor.");
        var task = await Eligible(userId, command.TaskId, ct); var now = clock.GetUtcNow(); await CheckClock(userId, now, ct);
        var prefs = await preferences.ReadAsync(userId, ct); var date = PlanTime.Date(now, prefs.Values.TimeZoneId);
        var selected = command.RemainingTaskIds.Length > 0 ? command.RemainingTaskIds : await (from b in db.TaskSchedules join p in db.DailyPlans on b.DailyPlanId equals p.Id
            where b.UserId == userId && p.UserId == userId && p.LocalDate == date && b.State == ScheduleState.Planned && b.Kind == ScheduleKind.Work && b.EndsAt > now select b.TaskId!.Value).Distinct().ToArrayAsync(ct);
        selected = selected.Append(task.Id).Concat(running?.TaskId is { } oldId ? [oldId] : Array.Empty<Guid>()).Distinct().Order().ToArray();
        if (selected.Length > 1000) throw new UseCaseException(ErrorKind.Validation, "start_now_selection_limit", "Kalan plan için en çok1000 görev seçin.");
        if (await db.Tasks.CountAsync(x => x.UserId == userId && selected.Contains(x.Id), ct) != selected.Length) throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        WorkView? paused = null;
        if (running is not null)
        {
            var segments = await db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == running.Id).ToArrayAsync(ct);
            if (now < running.StartedAt || segments.Any(x => now < (x.EndedAt ?? x.StartedAt))) throw Conflict("server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
            foreach (var segment in segments.Where(x => !x.IsVoided && x.EndedAt is null)) { segment.EndedAt = now; segment.Version++; }
            running.State = WorkState.Paused; running.Version++;
            if (running.TaskId is { } previousTaskId) TouchTask(await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == previousTaskId, ct), TaskState.Paused, now, "WorkInterrupted", running.Id);
            paused = View(running, Measured(segments, now), now);
            await Adhd.Infrastructure.Focus.FocusLifecycle.SyncWork(db, running, segments, now, ct);
            // Unique ve exclusion kuralları beklemiyor. Yeni aralıktan önce eskisini kapat.
            // İki kayıt da aynı işlemde. Alttaki hata eski çalışan aralığı da geri alır
            await db.SaveChangesAsync(ct);
        }
        var session = await db.WorkSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.TaskId == task.Id && x.State == WorkState.Paused, ct); var resumed = session is not null;
        decimal prior = 0;
        if (session is null)
        {
            session = new() { Id = Guid.CreateVersion7(), UserId = userId, TaskId = task.Id, StartedAt = now, RecordedAt = now, TimeZoneId = prefs.Values.TimeZoneId };
            db.WorkSessions.Add(session);
        }
        else
        {
            var segments = await db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == session.Id).ToArrayAsync(ct);
            if (now < session.StartedAt || segments.Any(x => now < (x.EndedAt ?? x.StartedAt))) throw Conflict("server_clock_conflict", "Sunucu zamanı çalışma kaydından geride.");
            prior = Measured(segments, now); session.State = WorkState.Running; session.Version++;
        }
        TouchTask(task, TaskState.InProgress, now, resumed ? "WorkResumedNow" : "WorkStartedNow", session.Id);
        if (!resumed) session.TaskSnapshot = JsonSerializer.Serialize(await Snapshot(task, state.PlanningVersion, ct), Json);
        db.WorkSegments.Add(Open(session, now)); state.PlanningVersion++; state.UpdatedAt = now;
        if (resumed) await Adhd.Infrastructure.Focus.FocusLifecycle.SyncWork(db, session, await db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == session.Id).ToArrayAsync(ct), now, ct);
        var result = new ImmediateWorkReceipt(View(session, prior, now), paused, date, state.PlanningVersion, selected, resumed);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "work-start-now", Key = key, RequestHash = hash, CreatedAt = now, Response = JsonSerializer.Serialize(result, Json) });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(result, false);
    }
}
