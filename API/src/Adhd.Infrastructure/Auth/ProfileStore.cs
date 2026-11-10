using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Adhd.Infrastructure.Auth;

public sealed class ProfileStore(PlannerDbContext db) : IProfileStore
{
    public Task<AppUser?> ReadAsync(Guid user, CancellationToken ct) => db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == user, ct);
    public async Task<bool> NameAsync(Guid user, long version, string firstName, string lastName, string displayName, CancellationToken ct) =>
        await db.Users.Where(x => x.Id == user && x.Version == version).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.FirstName, firstName).SetProperty(x => x.LastName, lastName).SetProperty(x => x.DisplayName, displayName)
            .SetProperty(x => x.Version, x => x.Version + 1), ct) == 1;
    public async Task<bool> PhotoAsync(Guid user, long version, Guid? photo, long? cloudVersion, Guid? revision, CancellationToken ct, bool clearGooglePicture = false) =>
        await db.Users.Where(x => x.Id == user && x.Version == version).ExecuteUpdateAsync(s =>
        {
            var calls = s.SetProperty(x => x.ProfilePhotoId, photo)
                         .SetProperty(x => x.ProfilePhotoCloudVersion, cloudVersion)
                         .SetProperty(x => x.ProfilePhotoRevision, revision)
                         .SetProperty(x => x.Version, x => x.Version + 1);
            if (clearGooglePicture || photo is null)
                calls = calls.SetProperty(x => x.GooglePictureUrl, (string?)null);
        }, ct) == 1;
}
