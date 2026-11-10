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
        var text = Text(fields.Text);
        var daily = fields.Kind == NoteKind.Daily;
        if (!Enum.IsDefined(fields.Kind) || daily != fields.LocalDate.HasValue ||
            (daily && (fields.TaskId.HasValue || fields.WorkSessionId.HasValue)))
            throw Invalid("note_invalid", "Not türü, görev ve yerel gün bağlamını kontrol edin.");
        if (fields.LocalDate is { } date) Date(date);
        var title = Shape(fields.Kind, fields.Display, fields.Title, fields.CategoryId);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var taskId = fields.TaskId; if (taskId.HasValue) _ = await Task(userId, taskId.Value, ct);
        if (fields.WorkSessionId.HasValue)
        {
            var work = await db.WorkSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == fields.WorkSessionId, ct) ?? throw Missing("session_not_found");
            if (fields.TaskId.HasValue && work.TaskId != fields.TaskId) throw Invalid("note_context_mismatch", "Çalışma ve görev bağlamları eşleşmiyor.");
            taskId ??= work.TaskId;
        }
        if (fields.Kind is NoteKind.Task or NoteKind.NextStep && taskId is null) throw Invalid("note_task_required", "Bu not türü gerçek bir görev bağlamı gerektirir.");
        var categoryId = fields.CategoryId;
        if (categoryId.HasValue) await ActiveCategory(userId, categoryId.Value, ct);
        else if (daily) categoryId = await DailyCategoryId(userId, ct);
        var now = clock.GetUtcNow(); var row = new UserNote { Id = Guid.CreateVersion7(), UserId = userId, TaskId = taskId, WorkSessionId = fields.WorkSessionId, Kind = fields.Kind,
            Text = text, Title = title, CategoryId = categoryId, Display = fields.Display, LocalDate = fields.LocalDate, DueAt = Utc(fields.DueAt), TimeZoneId = (await preferences.ReadAsync(userId, ct)).Values.TimeZoneId, CreatedAt = now, UpdatedAt = now };
        db.Notes.Add(row); state.NotesVersion++; await db.SaveChangesAsync(ct); var view = await ViewAsync(userId, row, ct); await tx.CommitAsync(ct); return view;
    }
    public async Task<NoteView> EditNoteAsync(Guid userId, Guid id, NoteEdit edit, CancellationToken ct)
    {
        var text = Text(edit.Text);
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var note = await Note(userId, id, ct); Check(note.Version, edit.Version);
        if (edit.Display is { } display)
        {
            var title = Shape(note.Kind, display, edit.Title, edit.CategoryId);
            if (edit.CategoryId.HasValue && edit.CategoryId != note.CategoryId) await ActiveCategory(userId, edit.CategoryId.Value, ct);
            note.Display = display; note.Title = title;
            note.CategoryId = edit.CategoryId ?? (note.Kind == NoteKind.Daily ? await DailyCategoryId(userId, ct) : (Guid?)null);
        }
        note.Text = text; note.DueAt = Utc(edit.DueAt); note.Version++; note.UpdatedAt = clock.GetUtcNow(); state.NotesVersion++;
        await db.SaveChangesAsync(ct); var view = await ViewAsync(userId, note, ct); await tx.CommitAsync(ct); return view;
    }
    public async Task<NoteView> RemoveNoteAsync(Guid userId, Guid id, long version, bool restore, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var note = restore ? await db.Notes.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("note_not_found") : await Note(userId, id, ct);
        Check(note.Version, version);
        if (restore && note.DeletedAt is null) throw Conflict("note_not_deleted", "Not silinmemiş; güncel listeyi alın.");
        note.DeletedAt = restore ? null : clock.GetUtcNow(); note.Version++; note.UpdatedAt = clock.GetUtcNow(); state.NotesVersion++;
        await db.SaveChangesAsync(ct); var view = await ViewAsync(userId, note, ct); await tx.CommitAsync(ct); return view;
    }
    public async Task<NotePage> NotesAsync(Guid userId, NoteQuery query, CancellationToken ct)
    {
        Page(query.Offset, query.Limit); if (query.Kind.HasValue && !Enum.IsDefined(query.Kind.Value)) throw Invalid("note_kind_invalid", "Not türü geçersiz."); if (query.Date.HasValue) Date(query.Date.Value);
        var term = query.Search?.Trim() ?? ""; if (term.Length > 200) throw Invalid("note_search_invalid", "Arama en çok 200 karakter olmalı.");
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); if (query.TaskId.HasValue) _ = await Task(userId, query.TaskId.Value, ct);
        if (query.CategoryId.HasValue && !await db.NoteCategories.AnyAsync(x => x.UserId == userId && x.Id == query.CategoryId, ct)) throw Missing("note_category_not_found");
        var q = db.Notes.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null && (!query.TaskId.HasValue || x.TaskId == query.TaskId) && (!query.Date.HasValue || x.LocalDate == query.Date)
            && (query.Kind.HasValue ? x.Kind == query.Kind : x.Kind != NoteKind.NextStep) && (!query.CategoryId.HasValue || x.CategoryId == query.CategoryId) && (!query.TaskLinked || x.TaskId != null));
        if (query.ExcludePinned) q = q.Where(x => x.CategoryId == null || !db.NoteCategories.Any(c => c.UserId == userId && c.Id == x.CategoryId && c.PinInAll && c.RemovedAt == null));
        if (term != "") q = q.Where(x => EF.Functions.Collate(x.Text, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower())
            || (x.Title != null && EF.Functions.Collate(x.Title, "adhd_search").ToLower().Contains(EF.Functions.Collate(term, "adhd_search").ToLower())));
        var joined = from n in q
                     join t in db.Tasks.AsNoTracking().Where(x => x.UserId == userId) on n.TaskId equals (Guid?)t.Id into tasks
                     from t in tasks.DefaultIfEmpty()
                     select new { Note = n, TaskTitle = t == null ? null : t.Title };
        var total = await joined.CountAsync(ct);
        var ordered = query.TaskLinked ? joined.OrderBy(x => x.TaskTitle).ThenBy(x => x.Note.TaskId).ThenByDescending(x => x.Note.UpdatedAt).ThenByDescending(x => x.Note.Id)
            : joined.OrderByDescending(x => x.Note.UpdatedAt).ThenByDescending(x => x.Note.Id);
        var rows = await ordered.Skip(query.Offset).Take(query.Limit).ToArrayAsync(ct); return new(rows.Select(x => View(x.Note, x.TaskTitle)).ToArray(), query.Offset, query.Limit, total);
    }
    public async Task<ConvertedNote> ConvertAsync(Guid userId, Guid id, NoteConversion command, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");
        var fields = TaskService.ValidateFields(new(command.Title, Priority: command.Priority ?? TaskPriority.Normal));
        if (command.PlannedFrom.HasValue != command.PlannedTo.HasValue || command.PlannedFrom > command.PlannedTo || command.PlannedTo?.DayNumber - command.PlannedFrom?.DayNumber > 366)
            throw Invalid("planned_range_invalid", "Tarih aralığı için başlangıç ve bitişi birlikte, en çok 367 gün olarak seçin.");
        if (command.EnergyDemand.HasValue && !Enum.IsDefined(command.EnergyDemand.Value)) throw Invalid("energy_invalid", "Efor Low/Medium/High veya boş olmalı.");
        command = command with { Title = fields.Title, DeadlineAt = Utc(command.DeadlineAt) };
        // Existing saved commands must retain their original hash when the new options are absent.
        var legacy = command.InheritNoteDueAt && command.PlannedFrom is null && command.PlannedTo is null && command.EnergyDemand is null && command.Priority is null;
        var hash = legacy ? Hash(new { id, command = new { command.Version, command.Title, command.PoolId, command.DeadlineAt } }) : Hash(new { id, command });
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == "note-convert" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw Conflict("idempotency_conflict", "Anahtar farklı dönüşümde kullanılmış.");
            return JsonSerializer.Deserialize<ConvertedNote>(previous.Response, RevisionWriter.Json)! with { Replayed = true };
        }
        var note = await Note(userId, id, ct); var deadline = command.DeadlineAt ?? (command.InheritNoteDueAt ? note.DueAt : null);
        var conversionHash = legacy ? Hash(new { command.Title, command.PoolId, deadline })
            : Hash(new { command.Title, command.PoolId, deadline, command.PlannedFrom, command.PlannedTo, command.EnergyDemand, priority = fields.Priority });
        ConvertedNote result;
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
                PlannedFrom = command.PlannedFrom, PlannedTo = command.PlannedTo, EnergyDemand = command.EnergyDemand, Priority = fields.Priority,
                SortOrder = (await db.Tasks.Where(x => x.UserId == userId && x.ParentTaskId == null && x.ArchivedAt == null).Select(x => (decimal?)x.SortOrder).MaxAsync(ct) ?? 0) + 1024 };
            db.Tasks.Add(task); TaskHistory.Append(db, task, "CreatedFromNote", null, new { noteId = note.Id }); note.ConvertedTaskId = task.Id; note.ConversionHash = conversionHash; note.Version++; note.UpdatedAt = now;
            state.PlanningVersion++; state.NotesVersion++; state.UpdatedAt = now; result = new(note.Id, task.Id, note.Version, state.PlanningVersion, false);
        }
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = "note-convert", Key = key, RequestHash = hash, CreatedAt = clock.GetUtcNow(), Response = JsonSerializer.Serialize(result, RevisionWriter.Json) });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return result;
    }
    private static string Hash(object value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value, RevisionWriter.Json))));
    private static NoteView View(UserNote n, string? taskTitle) => new(n.Id, n.Kind, n.Text, n.TaskId, n.WorkSessionId, n.LocalDate, n.TimeZoneId, n.DueAt, n.CreatedAt, n.UpdatedAt, n.DeletedAt, n.ConvertedTaskId, n.Version,
        n.Title, n.CategoryId, n.Display, taskTitle);
    private async Task<NoteView> ViewAsync(Guid userId, UserNote n, CancellationToken ct) =>
        View(n, n.TaskId is { } taskId ? await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && x.Id == taskId).Select(x => x.Title).SingleOrDefaultAsync(ct) : null);
    // Kısa not başlıksız, ayrıntılı ve toggle başlık ister. NextStep sade, kategorisiz kısa not kalır.
    private static string? Shape(NoteKind kind, NoteDisplay display, string? title, Guid? categoryId)
    {
        if (!Enum.IsDefined(display)) throw Invalid("note_display_invalid", "Not gösterimi geçersiz.");
        if (kind == NoteKind.NextStep && (display != NoteDisplay.Short || categoryId.HasValue)) throw Invalid("note_next_step_shape", "Sonraki adım notu kısa ve kategorisiz olmalı.");
        if (display == NoteDisplay.Short)
            return string.IsNullOrWhiteSpace(title) ? null : throw Invalid("note_title_invalid", "Kısa notta başlık olmaz; ayrıntılı notu seçin.");
        return !string.IsNullOrWhiteSpace(title) && title.Trim().Length <= 200 ? title.Trim() : throw Invalid("note_title_invalid", "Ayrıntılı not başlığı 1–200 karakter olmalı.");
    }
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
