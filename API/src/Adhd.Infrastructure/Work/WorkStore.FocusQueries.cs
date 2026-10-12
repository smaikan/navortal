using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Focus;
using Adhd.Domain.Focus;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Work;

public sealed partial class WorkStore
{
    public async Task<FocusPresetPage> PresetsAsync(Guid userId, int offset, int limit, CancellationToken ct)
    {
        FocusPageSize(offset, limit); var rows = db.FocusPresets.AsNoTracking().Where(x => x.UserId == userId); var total = await rows.CountAsync(ct);
        var items = await rows.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        return new(items.Select(PresetView).ToArray(), offset, limit, total, [new(900, 300), new(), new(2700, 600)]);
    }
    public async Task<FocusPresetView> SavePresetAsync(Guid userId, Guid? id, string name, FocusSettings settings, long? version, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 100 || !FocusRules.Valid(settings)) throw FocusInvalid();
        await using var tx = await db.Database.BeginTransactionAsync(ct); _ = await Lock(userId, ct);
        var preset = id.HasValue ? await db.FocusPresets.SingleOrDefaultAsync(x => x.UserId == userId && x.Id == id, ct) ?? throw new UseCaseException(ErrorKind.NotFound, "focus_preset_not_found", "Odak ayarı bulunamadı.") : new FocusPreset { Id = Guid.CreateVersion7(), UserId = userId };
        if (id.HasValue && preset.Version != version) throw Conflict("version_conflict", "Odak ayarı değişmiş.");
        preset.Name = name.Trim(); preset.Settings = JsonSerializer.Serialize(settings, Json); if (id.HasValue) preset.Version++; else db.FocusPresets.Add(preset);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return PresetView(preset);
    }
    public async Task<FocusCurrent> CurrentFocusAsync(Guid userId, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var now = clock.GetUtcNow();
        var result = await ObserveCurrentFocus(userId, state, now, ct); await tx.CommitAsync(ct); return result;
    }
    private async Task<FocusCurrent> ObserveCurrentFocus(Guid userId, Adhd.Domain.Users.UserPlanningState state, DateTimeOffset now, CancellationToken ct)
    {
        var focus = await db.FocusSessions.SingleOrDefaultAsync(x => x.UserId == userId && x.State != FocusState.Finished && x.State != FocusState.Interrupted, ct);
        if (focus is null) return new(null, now, new(new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), now));
        var work = await Find(userId, focus.WorkSessionId, ct); var segments = await FocusSegments(work.Id, userId, ct); await ObserveFocus(focus, work, segments, state, now, ct);
        var view = FocusViewOf(focus, work, segments, now); await db.SaveChangesAsync(ct); return new(view, now, new(new(state.PlanningVersion, state.NotesVersion, state.SpecialDaysVersion), now));
    }
    public async Task<FocusView> GetFocusAsync(Guid userId, Guid id, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct); var state = await Lock(userId, ct); var focus = await FindFocus(userId, id, ct); var work = await Find(userId, focus.WorkSessionId, ct);
        var now = clock.GetUtcNow(); var segments = await FocusSegments(work.Id, userId, ct); await ObserveFocus(focus, work, segments, state, now, ct);
        var view = FocusViewOf(focus, work, segments, now); await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return view;
    }
    public async Task<FocusPage> ListFocusAsync(Guid userId, int offset, int limit, CancellationToken ct)
    {
        FocusPageSize(offset, limit); await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct); var now = clock.GetUtcNow();
        var rows = db.FocusSessions.AsNoTracking().Where(x => x.UserId == userId); var total = await rows.CountAsync(ct); var focuses = await rows.OrderByDescending(x => x.StartedAt).ThenByDescending(x => x.Id).Skip(offset).Take(limit).ToArrayAsync(ct);
        var ids = focuses.Select(x => x.WorkSessionId).Distinct().ToArray(); var work = await db.WorkSessions.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var segments = await db.WorkSegments.AsNoTracking().Where(x => x.UserId == userId && ids.Contains(x.SessionId)).ToArrayAsync(ct); var byWork = segments.ToLookup(x => x.SessionId);
        return new(focuses.Select(x => FocusViewOf(x, work[x.WorkSessionId], byWork[x.WorkSessionId].ToArray(), now)).ToArray(), offset, limit, total);
    }
    private static FocusPresetView PresetView(FocusPreset p) => new(p.Id, p.Name, JsonSerializer.Deserialize<FocusSettings>(p.Settings, Json)!, p.Version);
    private static void FocusPageSize(int offset, int limit) { if (offset is < 0 or > 100000 || limit is < 1 or > 100) throw new UseCaseException(ErrorKind.Validation, "pagination_invalid", "Offset0..100000 ve limit1..100 olmalı."); }
}
