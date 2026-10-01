using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Support;
using Adhd.Application.Tasks;
using Adhd.Domain.Support;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Adhd.Infrastructure.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Support;

public sealed partial class SupportStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : ISupportStore
{
    public async Task<NoteView> CreateNoteAsync(Guid userId, NoteFields fields, CancellationToken ct)
    {
        var text = Text(fields.Text); if (!Enum.IsDefined(fields.Kind) || (fields.Kind == NoteKind.Daily) != fields.LocalDate.HasValue) throw Invalid("note_invalid", "Not türü, görev ve yerel gün bağlamını kontrol edin.");
        if (fields.LocalDate.HasValue) Date(fields.LocalDate.Value);
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct);
        var taskId = fields.TaskId; if (taskId.HasValue) _ = await Task(userId, taskId.Value, ct);
        if (fields.WorkSessionId.HasValue)
        {
            var work = await db.WorkSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == fields.WorkSessionId, ct) ?? throw Missing("session_not_found");
            if (fields.TaskId.HasValue && work.TaskId != fields.TaskId) throw Invalid("note_context_mismatch", "Çalışma ve görev bağlamları eşleşmiyor.");
            taskId ??= work.TaskId;
        }
        if (fields.Kind is NoteKind.Task or NoteKind.NextStep && taskId is null) throw Invalid("note_task_required", "Bu not türü gerçek bir görev bağlamı gerektirir.");
        var now = clock.GetUtcNow(); var row = new UserNote { Id = Guid.CreateVersion7(), UserId = userId, TaskId = taskId, WorkSessionId = fields.WorkSessionId, Kind = fields.Kind,
            Text = text, LocalDate = fields.LocalDate, DueAt = Utc(fields.DueAt), TimeZoneId = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId, CreatedAt = now, UpdatedAt = now };
        db.Notes.Add(row); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(row);
    }
    public async Task<NoteView> ChangeNoteAsync(Guid userId, Guid id, long version, string? text, DateTimeOffset? dueAt, bool remove, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct); var note = await Note(userId, id, ct); Check(note.Version, version);
        if (remove) note.DeletedAt = clock.GetUtcNow(); else { note.Text = Text(text); note.DueAt = Utc(dueAt); }
        note.Version++; note.UpdatedAt = clock.GetUtcNow(); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(note);
    }
    public async Task<NotePage> NotesAsync(Guid userId, Guid? taskId, NoteKind? kind, DateOnly? date, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); if (kind.HasValue && !Enum.IsDefined(kind.Value)) throw Invalid("note_kind_invalid", "Not türü geçersiz."); if (date.HasValue) Date(date.Value);
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); if (taskId.HasValue) _ = await Task(userId, taskId.Value, ct);
        var q = db.Notes.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && (!taskId.HasValue || x.TaskId == taskId) && (!kind.HasValue || x.Kind == kind) && (!date.HasValue || x.LocalDate == date));
        var total = await q.CountAsync(ct); var rows = await q.OrderByDescending(x => x.UpdatedAt).ThenByDescending(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct); return new(rows.Select(View).ToArray(), offset, limit, total);
    }
    public async Task<ConvertedNote> ConvertAsync(Guid userId, Guid id, NoteConversion command, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");
        var fields = TaskService.ValidateFields(new(command.Title)); command = command with { Title = fields.Title, DeadlineAt = Utc(command.DeadlineAt) }; var hash = Hash(new { id, command });
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "note-convert" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw Conflict("idempotency_conflict", "Anahtar farklı dönüşümde kullanılmış.");
            return JsonSerializer.Deserialize<ConvertedNote>(previous.Response, RevisionWriter.Json)! with { Replayed = true };
        }
        var note = await Note(userId, id, ct); var deadline = command.DeadlineAt ?? note.DueAt; var conversionHash = Hash(new { command.Title, command.PoolId, deadline }); ConvertedNote result;
        if (note.ConvertedTaskId.HasValue)
        {
            if (note.ConversionHash != conversionHash) throw Conflict("note_already_converted", "Not başka bir görev dönüşümüne bağlanmış.");
            result = new(note.Id, note.ConvertedTaskId.Value, note.Version, state.PlanningVersion, true);
        }
        else
        {
            Check(note.Version, command.Version);
            if (command.PoolId.HasValue && !await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == command.PoolId && x.ArchivedAt == null, ct)) throw Missing("pool_not_found");
            var now = clock.GetUtcNow(); var task = new TaskItem { Id = Guid.CreateVersion7(), UserId = userId, Title = command.Title, Description = note.Text, DeadlineAt = deadline, PoolId = command.PoolId, CreatedAt = now, UpdatedAt = now,
                SortOrder = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0) + 1024 };
            db.Tasks.Add(task); TaskHistory.Append(db, task, "CreatedFromNote", null, new { noteId = note.Id }); note.ConvertedTaskId = task.Id; note.ConversionHash = conversionHash; note.Version++; note.UpdatedAt = now;
            state.PlanningVersion++; state.UpdatedAt = now; result = new(note.Id, task.Id, note.Version, state.PlanningVersion, false);
        }
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "note-convert", Key = key, RequestHash = hash, CreatedAt = clock.GetUtcNow(), Response = JsonSerializer.Serialize(result, RevisionWriter.Json) });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
    }
    private static string Hash(object value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, RevisionWriter.Json))));
    private static NoteView View(UserNote n) => new(n.Id, n.Kind, n.Text, n.TaskId, n.WorkSessionId, n.LocalDate, n.TimeZoneId, n.DueAt, n.CreatedAt, n.UpdatedAt, n.DeletedAt, n.ConvertedTaskId, n.Version);
    private async Task<UserNote> Note(Guid userId, Guid id, CancellationToken ct) => await db.Notes.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id && x.DeletedAt == null, ct) ?? throw Missing("note_not_found");
    private async Task<TaskItem> Task(Guid userId, Guid id, CancellationToken ct) => await db.Tasks.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("task_not_found");
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={userId} FOR UPDATE").SingleAsync(ct);
    private static string Text(string? value) => !string.IsNullOrWhiteSpace(value) && value.Trim().Length <= 10000 ? value.Trim() : throw Invalid("note_text_invalid", "Not1..10000 karakter olmalı.");
    private static DateTimeOffset? Utc(DateTimeOffset? value) => value.HasValue ? new(value.Value.UtcTicks / 10 * 10, TimeSpan.Zero) : null;
    private static void Date(DateOnly date) { if (date.Year is < 2 or > 9998) throw Invalid("date_invalid", "Geçerli yerel gün seçin."); }
    private static void Page(int offset, int limit) { if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw Invalid("pagination_invalid", "Offset0..100000, limit1..100 olmalı."); }
    private static void Check(long actual, long expected) { if (actual != expected) throw Conflict("version_conflict", "Kayıt değişmiş; güncel değerleri alın."); }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    private static UseCaseException Missing(string code) => new(ErrorKind.NotFound, code, "Kayıt bulunamadı.");
}
