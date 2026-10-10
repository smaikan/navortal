using Adhd.Application.Auth;
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
        db.ExternalLogins.Add(new ExternalLogin { Id = Guid.CreateVersion7(), UserId = user.Id, Subject = subject });
        return await Save(ct);
    }
    public async Task<bool> TryLinkAsync(Guid userId, string subject, CancellationToken ct)
    {
        db.ExternalLogins.Add(new ExternalLogin { Id = Guid.CreateVersion7(), UserId = userId, Subject = subject });
        return await Save(ct);
    }
    private async Task<bool> Save(CancellationToken ct)
    {
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
        { db.ChangeTracker.Clear(); return false; }
    }
}
