using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Application.Recurrence;
using Adhd.Application.Tasks;
using Adhd.Domain.Planning;
using Adhd.Domain.Recurrence;
using Adhd.Domain.Tasks;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Recurrence;

public sealed partial class RecurrenceStore(PlannerDbContext db, IPreferencesStore preferences, TimeProvider clock) : IRecurrenceStore
{
    public async Task<RecurrenceEffect> CreateAsync(Guid userId, RecurrenceCreate command, string key, CancellationToken ct)
    {
        command = command with { Rule = Rule(command.Rule), Task = Defaults(command.Task) }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct);
        var replay = await Replay(userId, "recurrence-create", key, command, ct); if (replay is not null) return replay;
        await Pool(userId, command.Task, ct); var now = clock.GetUtcNow(); var template = new RecurrenceTemplate { Id = Guid.CreateVersion7(), UserId = userId, CreatedAt = now, UpdatedAt = now };
        var definition = Definition(template, command.Rule.StartDate, command.Rule, command.Task, now); db.RecurrenceTemplates.Add(template); db.RecurrenceDefinitions.Add(definition);
        var result = await Result(userId, template, definition, [], [], [], state.PlanningVersion, "recurrence-create", key, command, ct); await tx.CommitAsync(ct); return result;
    }
    public async Task<RecurrenceEffect> EnableAsync(Guid userId, Guid id, long version, bool enabled, string key, CancellationToken ct)
    {
        var payload = new { id, version, enabled }; await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var replay = await Replay(userId, "recurrence-enable", key, payload, ct); if (replay is not null) return replay;
        var template = await Find(userId, id, ct); Check(template, version); template.Enabled = enabled; template.Version++; template.UpdatedAt = clock.GetUtcNow(); var definition = await Head(userId, id, ct);
        var result = await Result(userId, template, definition, [], [], [], state.PlanningVersion, "recurrence-enable", key, payload, ct); await tx.CommitAsync(ct); return result;
    }
    private static RecurrenceRule Rule(RecurrenceRule rule)
    {
        if (rule is null || !RecurrenceRules.Valid(rule)) throw Invalid("recurrence_rule_invalid", "Tekrar tarihi/türü/aralığı/zone ve ay sonu politikalarını kontrol edin.");
        return rule with { WeekDays = (rule.WeekDays ?? []).Order().ToArray() };
    }
    private static RecurringTaskDefaults Defaults(RecurringTaskDefaults fields)
    {
        if (fields is null || fields.EstimatedSeconds < 0 || fields.EnergyDemand.HasValue && !Enum.IsDefined(fields.EnergyDemand.Value)) throw Invalid("recurrence_task_invalid", "Görev varsayılanları geçersiz.");
        var valid = TaskService.ValidateFields(new(fields.Title, fields.Description, fields.Priority, CanSplit: fields.CanSplit)); return fields with { Title = valid.Title };
    }
    private async Task Pool(Guid userId, RecurringTaskDefaults fields, CancellationToken ct)
    {
        if (fields.PoolId.HasValue && !await db.Pools.AnyAsync(x => x.UserId == userId && x.Id == fields.PoolId && x.ArchivedAt == null, ct)) throw Missing("pool_not_found");
    }
    private static RecurrenceDefinition Definition(RecurrenceTemplate template, DateOnly from, RecurrenceRule rule, RecurringTaskDefaults fields, DateTimeOffset now) => new()
    {
        Id = Guid.CreateVersion7(), UserId = template.UserId, TemplateId = template.Id, Number = template.Version, EffectiveFrom = from,
        Rule = JsonSerializer.Serialize(rule, RevisionWriter.Json), TaskDefaults = JsonSerializer.Serialize(fields, RevisionWriter.Json), CreatedAt = now
    };
    private static T Read<T>(string json) => JsonSerializer.Deserialize<T>(json, RevisionWriter.Json)!;
    private static string Hash(object payload) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, RevisionWriter.Json))));
    private async Task<RecurrenceEffect?> Replay(Guid userId, string scope, string key, object payload, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter.");
        var row = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == scope && x.Key == key, ct);
        if (row is null) return null; if (row.RequestHash != Hash(payload)) throw Conflict("idempotency_conflict", "Anahtar farklı tekrar komutunda kullanılmış."); return Read<RecurrenceEffect>(row.Response) with { Replayed = true };
    }
    private async Task<RecurrenceEffect> Result(Guid userId, RecurrenceTemplate template, RecurrenceDefinition definition, RecurrenceOccurrence[] rows, Guid[] refreshed, Guid[] protectedIds,
        long planningVersion, string scope, string key, object payload, CancellationToken ct)
    {
        await db.SaveChangesAsync(ct); var result = new RecurrenceEffect(View(template, definition), await Views(userId, rows, ct), refreshed, protectedIds, planningVersion);
        db.IdempotencyRecords.Add(new() { UserId = userId, Scope = scope, Key = key, RequestHash = Hash(payload), Response = JsonSerializer.Serialize(result, RevisionWriter.Json), CreatedAt = clock.GetUtcNow() }); await db.SaveChangesAsync(ct); return result;
    }
    private static RecurrenceTemplateView View(RecurrenceTemplate t, RecurrenceDefinition d) => new(t.Id, t.Enabled, t.Version, d.Id, d.Number, d.EffectiveFrom, Read<RecurrenceRule>(d.Rule), Read<RecurringTaskDefaults>(d.TaskDefaults), t.CreatedAt);
    private async Task<OccurrenceView[]> Views(Guid userId, RecurrenceOccurrence[] rows, CancellationToken ct)
    {
        var ids = rows.Where(x => x.TaskId.HasValue).Select(x => x.TaskId!.Value).ToArray(); var tasks = await db.Tasks.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        return rows.OrderBy(x => x.LocalDate).Select(x =>
        {
            var task = x.TaskId.HasValue ? tasks[x.TaskId.Value] : null; var state = task is null ? x.State : task.State == TaskState.Skipped ? OccurrenceState.Skipped : task.State == TaskState.Canceled ? OccurrenceState.Canceled : OccurrenceState.Materialized;
            return new OccurrenceView(x.Id, x.TemplateId, x.DefinitionId, x.AppliedDefinitionId, x.LocalDate, x.TimeZoneId, x.DueTime, x.DueAt, x.TimeAdjusted, x.TaskId, task?.State, task?.Version, task is not null && task.Version != x.SyncedTaskVersion, state, x.Reason);
        }).ToArray();
    }
    private async Task<RecurrenceTemplate> Find(Guid userId, Guid id, CancellationToken ct) => await db.RecurrenceTemplates.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw Missing("recurrence_not_found");
    private Task<RecurrenceDefinition> Head(Guid userId, Guid id, CancellationToken ct) => db.RecurrenceDefinitions.Where(x => x.UserId == userId && x.TemplateId == id).OrderByDescending(x => x.Number).FirstAsync(ct);
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\"={userId} FOR UPDATE").SingleAsync(ct);
    private static void Check(RecurrenceTemplate template, long version) { if (template.Version != version) throw Conflict("version_conflict", "Tekrar şablonu değişmiş; güncel kaydı alın."); }
    private static void Date(DateOnly date) { if (date.Year is < 2 or > 9998) throw Invalid("date_invalid", "Geçerli yerel tarih seçin."); }
    private static void Window(DateOnly from, DateOnly to) { Date(from); Date(to); if (to.DayNumber - from.DayNumber is < 0 or > 92) throw Invalid("recurrence_window_invalid", "Açık1..93 günlük pencere seçin."); }
    private static void Page(int offset, int limit) { if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw Invalid("pagination_invalid", "Offset0..100000, limit1..100 olmalı."); }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    private static UseCaseException Missing(string code) => new(ErrorKind.NotFound, code, "Tekrar kaydı bulunamadı.");
}
