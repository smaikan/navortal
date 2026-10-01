using System.Text.Json;
using Adhd.Application.Common;
using Adhd.Application.Preferences;
using Adhd.Domain.Preferences;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Preferences;

// Ayarları sürümüyle tek işlemde yaz. Domain tarafı JSON ve EF'ye bağlı kalmasın.
public sealed class UserPreferencesRecord
{
    public Guid UserId { get; set; }
    public long Version { get; set; }
    public string Payload { get; set; } = "{}";
}
public sealed class PreferencesStore(PlannerDbContext db, TimeProvider clock) : IPreferencesStore
{
    public async Task<PreferencesSnapshot> ReadAsync(Guid userId, CancellationToken ct)
    {
        var row = await db.Preferences.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        return row is null ? new(0, new PlanningPreferences()) : new(row.Version, JsonSerializer.Deserialize<PlanningPreferences>(row.Payload)!);
    }
    public async Task<PreferencesSnapshot> WriteAsync(Guid userId, long expectedVersion, PlanningPreferences values, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var state = await db.PlanningStates.FromSqlInterpolated($"SELECT * FROM user_planning_states WHERE \"UserId\" = {userId} FOR UPDATE").SingleAsync(ct);
        var row = await db.Preferences.SingleOrDefaultAsync(x => x.UserId == userId, ct);
        if ((row?.Version ?? 0) != expectedVersion)
            throw new UseCaseException(ErrorKind.Conflict, "version_conflict", "Tercihler değişmiş; güncel değerleri alın.");
        if (row is null) { row = new() { UserId = userId }; db.Preferences.Add(row); }
        row.Payload = JsonSerializer.Serialize(values); row.Version++;
        state.PlanningVersion++; state.UpdatedAt = clock.GetUtcNow();
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return new(row.Version, values);
    }
}
