using Adhd.Application.Auth;
using Adhd.Application.Common;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.Infrastructure.Auth;

public sealed class GoogleAccountStore(PlannerDbContext db) : IGoogleAccountStore
{
    public Task<AppUser?> FindAsync(string subject, CancellationToken ct) =>
        (from link in db.ExternalLogins join user in db.Users on link.UserId equals user.Id
         where link.Provider == "Google" && link.Subject == subject select user).SingleOrDefaultAsync(ct);

    public async Task<bool> TryCreateAsync(AppUser user, string subject, CancellationToken ct)
    {
        db.Users.Add(user);
        db.PlanningStates.Add(new UserPlanningState { UserId = user.Id, UpdatedAt = user.CreatedAt });
        db.NoteCategories.Add(Adhd.Domain.Support.NoteCategory.DefaultWarning(user.Id, user.CreatedAt));
        db.ExternalLogins.Add(new ExternalLogin { Id = Guid.CreateVersion7(), UserId = user.Id, Provider = "Google", Subject = subject });
        return await Save(ct);
    }

    public async Task<bool> TryLinkAsync(Guid userId, string subject, CancellationToken ct, GoogleProfileImport? import = null, long? expectedVersion = null)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var existingUserId = await (from link in db.ExternalLogins
                                    where link.Provider == "Google" && link.Subject == subject
                                    select link.UserId).SingleOrDefaultAsync(ct);
        if (existingUserId != Guid.Empty)
        {
            if (existingUserId == userId) return true;
            return false;
        }

        if (import is not null && expectedVersion.HasValue)
        {
            var updated = await db.Users.Where(x => x.Id == userId && x.Version == expectedVersion.Value)
                .ExecuteUpdateAsync(s =>
                {
                    var calls = s.SetProperty(x => x.Version, x => x.Version + 1);
                    if (import.FirstName is not null) calls = calls.SetProperty(x => x.FirstName, import.FirstName);
                    if (import.LastName is not null) calls = calls.SetProperty(x => x.LastName, import.LastName);
                    if (import.DisplayName is not null) calls = calls.SetProperty(x => x.DisplayName, import.DisplayName);
                    if (import.GooglePictureUrl is not null) calls = calls.SetProperty(x => x.GooglePictureUrl, import.GooglePictureUrl);
                }, ct);

            if (updated == 0)
            {
                await tx.RollbackAsync(ct);
                throw new UseCaseException(ErrorKind.Conflict, "profile_version_conflict", "Profil başka bir yerde değişti. Güncel bilgileri kontrol et.");
            }
        }

        db.ExternalLogins.Add(new ExternalLogin { Id = Guid.CreateVersion7(), UserId = userId, Provider = "Google", Subject = subject });
        try
        {
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            foreach (var entry in db.ChangeTracker.Entries<AppUser>().Where(x => x.Entity.Id == userId).ToArray())
                await entry.ReloadAsync(ct);
            return true;
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        {
            await tx.RollbackAsync(ct);
            db.ChangeTracker.Clear();
            return false;
        }
    }

    private async Task<bool> Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { db.ChangeTracker.Clear(); return false; }
    }
}
