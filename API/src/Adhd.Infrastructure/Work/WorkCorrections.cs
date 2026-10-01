using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Domain.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public async Task<StartWorkResult> ManualAsync(Guid userId, ManualWork command, string key, CancellationToken ct)
    {
        ValidateKey(key); var reason = Reason(command.Reason);
        var start = Utc(command.StartedAt); var end = Utc(command.EndedAt);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { command.TaskId, start, end, reason }, Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await db.IdempotencyRecords.SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "work-manual" && x.Key == key, ct);
        if (replay is not null)
        {
            if (replay.RequestHash != hash) throw Conflict("idempotency_conflict", "Bu anahtar başka bir komutta kullanılmış.");
            return new(ReadReplay(replay.Response), true);
        }
        var task = await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == command.TaskId, ct)
            ?? throw new UseCaseException(ErrorKind.NotFound, "task_not_found", "Görev bulunamadı.");
        if (!task.HasDirectWork) throw new UseCaseException(ErrorKind.Validation, "direct_work_required", "Gerçek çalışmayı doğrudan işi olan göreve kaydedin.");
        var now = clock.GetUtcNow(); ValidateRange(start, end, now, false);
        if (start == end) throw new UseCaseException(ErrorKind.Validation, "work_range_invalid", "Manuel çalışma aralığı sıfır olamaz.");
        await NoOverlap(userId, null, start, end, false, ct);
        var session = new WorkSession { Id = Guid.CreateVersion7(), UserId = userId, TaskId = task.Id, StartedAt = start, EndedAt = end, RecordedAt = now,
            State = WorkState.Finished, Source = WorkSource.Manual, TimeZoneId = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId };
        TouchTask(task, task.State, now, "WorkManuallyAdded", session.Id);
        session.TaskSnapshot = JsonSerializer.Serialize(await Snapshot(task, state.PlanningVersion, ct), Json);
        var segment = Open(session, start); segment.EndedAt = end; db.WorkSessions.Add(session); db.WorkSegments.Add(segment);
        db.WorkCorrections.Add(Journal(session, segment, null, null, "ManualAdded", reason, now));
        state.PlanningVersion++; state.UpdatedAt = now; var view = View(session, WorkTime.Seconds(start, end), now);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "work-manual", Key = key, RequestHash = hash, CreatedAt = now, Response = JsonSerializer.Serialize(view, Json) });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(view, false);
    }
    public async Task<WorkView> CorrectAsync(Guid userId, Guid sessionId, Guid segmentId, CorrectWork command, CancellationToken ct)
    {
        var reason = Reason(command.Reason);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var session = await Find(userId, sessionId, ct);
        var segments = await db.WorkSegments.Where(x => x.UserId == userId && x.SessionId == sessionId).ToArrayAsync(ct);
        var segment = segments.SingleOrDefault(x => x.Id == segmentId) ?? throw new UseCaseException(ErrorKind.NotFound, "segment_not_found", "Çalışma aralığı bulunamadı.");
        if (session.Version != command.Version || segment.Version != command.SegmentVersion) throw Conflict("version_conflict", "Çalışma kaydı değişmiş; güncel kaydı alın.");
        var now = clock.GetUtcNow(); var start = Utc(command.StartedAt); var end = command.EndedAt is { } ended ? Utc(ended) : (DateTimeOffset?)null;
        ValidateRange(start, end, now, command.IsVoided);
        if (end is null && (segment.EndedAt is not null || session.State != WorkState.Running))
            throw Conflict("correction_cannot_resume", "Kapalı aralığı düzeltmeyle açamazsınız; devam komutunu kullanın.");
        if (segments.Any(x => (x.EndedAt ?? x.StartedAt) > now)) throw Conflict("server_clock_conflict", "Sunucu zamanı önceki kayıttan geride; tekrar deneyin.");
        await NoOverlap(userId, segmentId, start, end, command.IsVoided, ct);
        var before = Segment(segment); var beforeSession = Audit(session); var wasRunning = session.State == WorkState.Running;
        segment.StartedAt = start; segment.EndedAt = end; segment.IsVoided = command.IsVoided; segment.Version++;
        WorkCorrectionRules.UpdateEnvelope(session, segments); session.Version++;
        var journal = Journal(session, segment, before, beforeSession, "Adjusted", reason, now); db.WorkCorrections.Add(journal);
        if (session.TaskId is { } taskId)
        {
            var task = await db.Tasks.SingleAsync(x => x.UserId == userId && x.Id == taskId, ct);
            var taskBefore = Adhd.Infrastructure.Tasks.TaskStore.View(task);
            if (wasRunning && session.State == WorkState.Finished && task.State == TaskState.InProgress) task.State = TaskState.Paused;
            task.Version++; task.UpdatedAt = now;
            Adhd.Infrastructure.Tasks.TaskHistory.Append(db, task, "WorkCorrected", taskBefore, new { sessionId, segmentId, correctionId = journal.Id });
        }
        state.PlanningVersion++; state.UpdatedAt = now;
        await Adhd.Infrastructure.Focus.FocusLifecycle.SyncWork(db, session, segments, now, ct);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(session, Measured(segments, now), now);
    }
    public async Task<CorrectionPage> CorrectionsAsync(Guid userId, Guid sessionId, int offset, int limit, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, ct); _ = await Find(userId, sessionId, ct);
        var query = db.WorkCorrections.AsNoTracking().Where(x => x.UserId == userId && x.SessionId == sessionId); var total = await query.CountAsync(ct);
        var rows = await query.OrderBy(x => x.Sequence).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(rows.Select(x => new CorrectionView(x.Id, x.SessionId, x.SegmentId, x.Sequence, x.Kind, x.Reason, x.CreatedAt,
            x.PreviousValues is null ? null : JsonSerializer.Deserialize<SegmentView>(x.PreviousValues, Json), JsonSerializer.Deserialize<SegmentView>(x.NewValues, Json)!,
            x.PreviousSession is null ? null : JsonSerializer.Deserialize<SessionAudit>(x.PreviousSession, Json), JsonSerializer.Deserialize<SessionAudit>(x.NewSession, Json)!)).ToArray(), offset, limit, total);
    }
    private async Task NoOverlap(Guid userId, Guid? excluding, DateTimeOffset start, DateTimeOffset? end, bool voided, CancellationToken ct)
    {
        if (voided || start == end) return;
        if (await db.WorkSegments.AnyAsync(x => x.UserId == userId && x.Id != excluding && !x.IsVoided && (x.EndedAt == null || x.EndedAt > x.StartedAt)
            && (end == null || x.StartedAt < end) && (x.EndedAt == null || x.EndedAt > start), ct))
            throw Conflict("work_overlap", "Bu zaman aralığı başka bir gerçek çalışmayla çakışıyor.");
    }
    private static DateTimeOffset Utc(DateTimeOffset value) => new(value.UtcTicks - value.UtcTicks % 10, TimeSpan.Zero);
    private static void ValidateRange(DateTimeOffset start, DateTimeOffset? end, DateTimeOffset now, bool voided)
    {
        if (!WorkCorrectionRules.IsValidRange(start, end, now, voided))
            throw new UseCaseException(ErrorKind.Validation, "work_range_invalid", "Geçerli, geleceğe taşmayan bir çalışma aralığı girin; boşaltılan aralık kapalı olmalı.");
    }
    private static string Reason(string value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 2000 ? value.Trim()
        : throw new UseCaseException(ErrorKind.Validation, "correction_reason_required", "Düzeltme nedeni gerekli; en çok2000 karakter olabilir.");
    private static void ValidateKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw new UseCaseException(ErrorKind.Validation, "idempotency_key_required", "Idempotency-Key başlığı gerekli; en çok128 karakter olabilir.");
    }
    private static SegmentView Segment(WorkSessionSegment s) => new(s.Id, s.StartedAt, s.EndedAt, s.IsVoided, s.Version);
    private static SessionAudit Audit(WorkSession s) => new(s.StartedAt, s.EndedAt, s.State, s.Version);
    private static WorkSessionCorrection Journal(WorkSession session, WorkSessionSegment segment, SegmentView? before, SessionAudit? beforeSession, string kind, string reason, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(), UserId = session.UserId, SessionId = session.Id, SegmentId = segment.Id, Sequence = session.Version, Kind = kind, Reason = reason, CreatedAt = now,
        PreviousValues = before is null ? null : JsonSerializer.Serialize(before, Json), NewValues = JsonSerializer.Serialize(Segment(segment), Json),
        PreviousSession = beforeSession is null ? null : JsonSerializer.Serialize(beforeSession, Json), NewSession = JsonSerializer.Serialize(Audit(session), Json)
    };
}
