using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.Infrastructure.Auth;

public sealed class UserStore(PlannerDbContext db) : IUserStore
{
    public Task<AppUser?> FindByEmailAsync(string email, CancellationToken ct) => db.Users.SingleOrDefaultAsync(x => x.NormalizedEmail == email, ct);
    public Task<AppUser?> FindByIdAsync(Guid id, CancellationToken ct) => db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
    public async Task<bool> TryAddAsync(AppUser user, CancellationToken ct)
    {
        db.Users.Add(user);
        db.PlanningStates.Add(new UserPlanningState { UserId = user.Id, UpdatedAt = user.CreatedAt });
        db.NoteCategories.Add(Adhd.Domain.Support.NoteCategory.DefaultWarning(user.Id, user.CreatedAt));
        try { await db.SaveChangesAsync(ct); return true; }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "IX_users_NormalizedEmail" })
        { db.ChangeTracker.Clear(); return false; }
    }
}
