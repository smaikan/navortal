using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Notifications;
using Adhd.Domain.Jobs;
using Adhd.Domain.Notifications;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Notifications;

public sealed partial class NotificationStore
{
    public async Task<CustomReminderView[]> RemindersAsync(Guid user, int offset, int limit, CancellationToken ct)
    {
        Page(offset, limit); return (await db.CustomReminders.AsNoTracking().Where(x => x.UserId == user).OrderBy(x => x.DueAt).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct)).Select(View).ToArray();
    }
    public async Task<CustomReminderView> SaveReminderAsync(Guid user, Guid? id, CustomReminderCommand command, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required");
        command = command with { Title = command.Title?.Trim() ?? "", DueAt = new(command.DueAt.UtcTicks / 10 * 10, TimeSpan.Zero) };
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { id, command }, RevisionWriter.Json))));
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct);
        var previous = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Scope == "custom-reminder" && x.Key == key, ct);
        if (previous is not null)
        {
            if (previous.RequestHash != hash) throw new UseCaseException(ErrorKind.Conflict, "idempotency_conflict", "Anahtar farklı komutta kullanılmış.");
            return JsonSerializer.Deserialize<CustomReminderView>(previous.Response, RevisionWriter.Json)!;
        }
        var now = clock.GetUtcNow(); if (command.Title.Length is < 1 or > 200 || command.DueAt <= now || command.DueAt > now.AddYears(1)) throw Invalid("reminder_invalid");
        if (command.TaskId.HasValue && !await db.Tasks.AnyAsync(x => x.UserId == user && x.Id == command.TaskId, ct)) throw Missing();
        CustomReminder row;
        if (id.HasValue)
        {
            row = await db.CustomReminders.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct) ?? throw Missing(); Check(row.Version, command.Version ?? -1); row.Version++;
            await InvalidateReminder(user, row.Id, ct);
        }
        else { row = new() { Id = Guid.CreateVersion7(), UserId = user }; db.CustomReminders.Add(row); }
        row.Title = command.Title; row.DueAt = command.DueAt; row.TaskId = command.TaskId; row.Canceled = false;
        db.NotificationIntents.Add(new() { Id = Guid.CreateVersion7(), UserId = user, Kind = "Custom", SourceKey = $"custom:{row.Id}:v{row.Version}", SourceId = row.Id, SourceVersion = row.Version, TaskId = row.TaskId, OccurredAt = row.DueAt, CreatedAt = now, NotBefore = row.DueAt });
        var view = View(row); db.IdempotencyRecords.Add(new() { UserId = user, Scope = "custom-reminder", Key = key, RequestHash = hash, Response = JsonSerializer.Serialize(view, RevisionWriter.Json), CreatedAt = now });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return view;
    }
    public async Task<CustomReminderView> CancelReminderAsync(Guid user, Guid id, long version, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); await Lock(user, ct); var row = await db.CustomReminders.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id, ct) ?? throw Missing(); Check(row.Version, version);
        row.Canceled = true; row.Version++; await InvalidateReminder(user, id, ct); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return View(row);
    }
    private Task<int> InvalidateReminder(Guid user, Guid id, CancellationToken ct) => db.NotificationIntents.Where(x => x.UserId == user && x.Kind == "Custom" && x.SourceId == id && x.State != NotificationIntentState.Obsolete)
        .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, NotificationIntentState.Obsolete).SetProperty(x => x.Version, x => x.Version + 1), ct);
    private static CustomReminderView View(CustomReminder row) => new(row.Id, row.Title, row.DueAt, row.TaskId, row.Canceled, row.Version);
}
