using System.Collections.Immutable;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Domain.Scheduling;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Adhd.Infrastructure.Planning;
using Adhd.Infrastructure.Work;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Scheduling;

public sealed partial class SchedulingCoordinator(PlannerDbContext db, IPreferencesStore preferences, WorkStore work, TimeProvider clock, SchedulingEngine engine, PlanUndoEngine undoEngine, MultiDaySchedulingEngine distributionEngine) : ISchedulingCoordinator, IDistributionCoordinator
{
    public async Task<SchedulingPreviewView> PreviewAsync(Guid userId, SchedulingRequest request, CancellationToken ct)
    {
        var input = await new SchedulingSnapshotBuilder(db, preferences, clock).Build(userId, request, ct);
        return await SaveProposal(userId, input, Generate(input), ct);
    }
    private SchedulingProposal Generate(SchedulingInput input) => input.Undo is { } undo
        ? undoEngine.Generate(new(input.Snapshot, input.Intent, input.CurrentSchedules.Select(UndoView).ToImmutableArray(), undo.Changes.ToImmutableArray(), undo.AllowProtectedChange, input.ActiveTaskId))
        : MatchExisting(engine.Generate(input.Snapshot, input.Intent), input.CurrentSchedules);
    private async Task<SchedulingPreviewView> SaveProposal(Guid userId, SchedulingInput input, SchedulingProposal output, CancellationToken ct)
    {
        var now = input.Snapshot.ServerNow; var id = Guid.CreateVersion7();
        var view = new SchedulingPreviewView(id, output.InputPlanningVersion, now, now.AddMinutes(2), output.AnchorAt, input.PlanningMode,
            output.AlgorithmVersion, output.HasConstraintConflicts, !output.HasConstraintConflicts, "Pending", output.Blocks, Differences(input.CurrentSchedules, output.Blocks), output.Unplaced, output.Warnings, output.Explanations,
            ReversesChangeSetId: input.Undo?.ChangeSetId, IsPartial: input.Undo is not null && output.Warnings.Length > 0);
        db.SchedulingProposals.Add(new() { Id = id, UserId = userId, LocalDate = input.Snapshot.LocalDate, InputPlanningVersion = output.InputPlanningVersion,
            CreatedAt = now, ExpiresAt = view.ExpiresAt, InputHash = Hash(input), Input = Serialize(input), PublicResult = Serialize(view), ReversesChangeSetId = input.Undo?.ChangeSetId });
        await db.SaveChangesAsync(ct); return view;
    }
    public async Task<SchedulingPreviewView> GetAsync(Guid userId, Guid proposalId, CancellationToken ct) => Public(await Find(userId, proposalId, ct), clock.GetUtcNow());
    public async Task<SchedulingApplyOutcome> ApplyAsync(Guid userId, Guid proposalId, string key, CancellationToken ct)
    {
        var result = await ApplyCore(userId, proposalId, "scheduling-apply", key, new { proposalId }, (_, applied) => applied, ct);
        return new(result.Value, result.Replayed);
    }
    public async Task<SchedulingPlanOutcome> PlanAsync(Guid userId, SchedulingRequest request, string key, CancellationToken ct)
    {
        Key(key); var payload = new { request.Date, taskIds = request.TaskIds?.Order().ToArray(), request.ExpectedPlanningVersion, newWorkNotBefore = request.NewWorkNotBefore?.ToUniversalTime() };
        var replay = await Replay<SchedulingPreviewView>(userId, "scheduling-plan", key, Hash(payload), ct); if (replay is not null) return new(replay, true);
        SchedulingPreviewView preview;
        try { preview = await PreviewAsync(userId, request, ct); }
        catch (UseCaseException ex) when (ex.Kind == ErrorKind.Conflict)
        {
            replay = await Replay<SchedulingPreviewView>(userId, "scheduling-plan", key, Hash(payload), ct); if (replay is not null) return new(replay, true); throw;
        }
        if (preview.PlanningMode == "Auto" && !preview.HasConstraintConflicts)
        {
            var applied = await ApplyCore(userId, preview.ProposalId, "scheduling-plan", key, payload, (view, effect) => view with { Status = "Applied", CanApply = false, Applied = effect }, ct);
            return new(applied.Value, applied.Replayed);
        }
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct);
        replay = await Replay<SchedulingPreviewView>(userId, "scheduling-plan", key, Hash(payload), ct); if (replay is not null) return new(replay, true);
        Remember(userId, "scheduling-plan", key, Hash(payload), preview, clock.GetUtcNow()); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return new(preview, false);
    }
    private static SchedulingProposal MatchExisting(SchedulingProposal proposal, ScheduleView[] current)
    {
        var used = proposal.Blocks.Where(x => x.ExistingScheduleId.HasValue).Select(x => x.ExistingScheduleId!.Value).ToHashSet();
        return proposal with { Blocks = proposal.Blocks.Select(block =>
        {
            if (block.ExistingScheduleId.HasValue || block.IsActive) return block;
            var same = current.Where(x => !used.Contains(x.Id) && Same(x, block)).OrderBy(x => x.Id).FirstOrDefault();
            if (same is null) return block; used.Add(same.Id); return block with { ExistingScheduleId = same.Id };
        }).ToImmutableArray() };
    }
    private static bool Same(ScheduleView before, SchedulingBlock after) => before.TaskId == after.TaskId && before.Kind == after.Kind && before.StartsAt == after.StartsAt && before.EndsAt == after.EndsAt
        && before.IsFixed == after.IsFixed && before.IsLocked == after.IsLocked && before.IsAutomatic == after.IsAutomatic;
    private static ImmutableArray<ScheduleDifference> Differences(ScheduleView[] current, ImmutableArray<SchedulingBlock> blocks)
    {
        var result = new List<ScheduleDifference>(); var used = new HashSet<Guid>();
        foreach (var after in blocks)
        {
            var before = after.ExistingScheduleId is { } id ? current.Single(x => x.Id == id) : null;
            if (before is null) result.Add(new("Added", null, after.TaskId, null, after));
            else { used.Add(before.Id); if (before.State == Adhd.Domain.Planning.ScheduleState.Removed) result.Add(new("Restored", before.Id, after.TaskId, before, after)); else if (!Same(before, after)) result.Add(new("Updated", before.Id, after.TaskId, before, after)); }
        }
        result.AddRange(current.Where(x => x.State == Adhd.Domain.Planning.ScheduleState.Planned && !used.Contains(x.Id)).Select(x => new ScheduleDifference("Removed", x.Id, x.TaskId, x, null)));
        return result.OrderBy(x => x.Type, StringComparer.Ordinal).ThenBy(x => x.ScheduleId).ThenBy(x => x.TaskId).ThenBy(x => x.After?.StartsAt).ToImmutableArray();
    }
    private SchedulingPreviewView Public(SchedulingProposalRecord row, DateTimeOffset now)
    {
        var view = Deserialize<SchedulingPreviewView>(row.PublicResult); var expired = row.Status != "Applied" && now >= row.ExpiresAt;
        return view with { Status = row.Status == "Applied" ? "Applied" : expired ? "Expired" : row.Status,
            CanApply = row.Status == "Pending" && !expired && !view.HasConstraintConflicts,
            Applied = row.AppliedResult is null ? null : Deserialize<SchedulingApplyResult>(row.AppliedResult) };
    }
    private async Task<T?> Replay<T>(Guid userId, string scope, string key, string hash, CancellationToken ct) where T : class
    {
        var row = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId && x.Scope == scope && x.Key == key, ct);
        if (row is null) return null; if (row.RequestHash != hash) throw Conflict("idempotency_conflict", "Bu anahtar başka bir komutta kullanılmış."); return Deserialize<T>(row.Response);
    }
    private void Remember<T>(Guid userId, string scope, string key, string hash, T response, DateTimeOffset now) => db.IdempotencyRecords.Add(new() { UserId = userId, Scope = scope, Key = key, RequestHash = hash, Response = Serialize(response), CreatedAt = now });
    private static void Key(string key) { if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw new UseCaseException(ErrorKind.Validation, "idempotency_key_required", "Idempotency-Key gerekli; en çok128 karakter."); }
    private Task<UserPlanningState> Lock(Guid userId, CancellationToken ct) => db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
    private async Task<SchedulingProposalRecord> Find(Guid userId, Guid id, CancellationToken ct) => await db.SchedulingProposals.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id && x.Kind == "Day", ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "proposal_not_found", "Öneri bulunamadı.");
    private static UseCaseException Conflict(string code, string message) => new(ErrorKind.Conflict, code, message);
    private static string Serialize<T>(T value) => JsonSerializer.Serialize(value, RevisionWriter.Json);
    private static T Deserialize<T>(string value) => JsonSerializer.Deserialize<T>(value, RevisionWriter.Json)!;
    private static string Hash<T>(T value)
    {
        using var document = JsonDocument.Parse(Serialize(value)); using var bytes = new MemoryStream();
        using (var writer = new Utf8JsonWriter(bytes)) Canonical(writer, document.RootElement);
        return Convert.ToHexString(SHA256.HashData(bytes.ToArray()));
    }
    private static void Canonical(Utf8JsonWriter writer, JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject(); foreach (var property in value.EnumerateObject().OrderBy(x => x.Name, StringComparer.Ordinal)) { writer.WritePropertyName(property.Name); Canonical(writer, property.Value); } writer.WriteEndObject();
        }
        else if (value.ValueKind == JsonValueKind.Array) { writer.WriteStartArray(); foreach (var item in value.EnumerateArray()) Canonical(writer, item); writer.WriteEndArray(); }
        else if (value.ValueKind == JsonValueKind.Number) writer.WriteRawValue(value.GetDecimal().ToString("G29", System.Globalization.CultureInfo.InvariantCulture));
        else value.WriteTo(writer);
    }
}
