using Adhd.Application.Common;
using Adhd.Domain.Users;

namespace Adhd.Application.Auth;

public sealed record ProfileView(UserSummary User, bool PhotoUploadEnabled, string FirstName, string LastName);
public sealed record ProfilePhoto(long CloudVersion);
public interface IProfileStore
{
    Task<AppUser?> ReadAsync(Guid user, CancellationToken ct);
    Task<bool> NameAsync(Guid user, long version, string firstName, string lastName, string displayName, CancellationToken ct);
    Task<bool> PhotoAsync(Guid user, long version, Guid? photo, long? cloudVersion, Guid? revision, CancellationToken ct);
}
public interface IProfilePhotos
{
    bool Enabled { get; }
    Task<ProfilePhoto> UploadAsync(Guid user, Guid photo, byte[] bytes, string mediaType, CancellationToken ct);
    Task<byte[]> ReadAsync(Guid user, Guid photo, long cloudVersion, CancellationToken ct);
    Task DeleteAsync(Guid user, Guid photo, CancellationToken ct);
}

public sealed class ProfileService(IProfileStore store, IProfilePhotos photos)
{
    public const int MaxPhotoBytes = 2 * 1024 * 1024;
    public const int MaxBase64Length = 2796204;
    public async Task<ProfileView> ReadAsync(Guid user, CancellationToken ct) => View(await Required(user, ct));
    public const int MaxNamePart = 50;
    // Eski görünen adı bölme. Parolalı hesapta bu değer e-postaysa ad alanı boş sayılır.
    private ProfileView View(AppUser user) => new(AuthService.Summary(user), photos.Enabled,
        user.FirstName ?? (string.Equals(user.DisplayName, user.Email, StringComparison.OrdinalIgnoreCase) ? "" : user.DisplayName), user.LastName ?? "");
    private async Task<AppUser> Required(Guid user, CancellationToken ct) => await store.ReadAsync(user, ct)
        ?? throw new UseCaseException(ErrorKind.NotFound, "profile_not_found", "Profil bulunamadı.");
    private static void Version(AppUser user, long version)
    {
        if (version < 1 || user.Version != version) throw Conflict();
    }
    private static UseCaseException Conflict() => new(ErrorKind.Conflict, "profile_version_conflict", "Profil başka bir yerde değişti. Güncel bilgileri kontrol et.");
    public async Task<ProfileView> NameAsync(Guid user, long version, string firstName, string? lastName, CancellationToken ct)
    {
        firstName = (firstName ?? "").Trim(); lastName = (lastName ?? "").Trim();
        if (firstName.Length is < 1 or > MaxNamePart || lastName.Length > MaxNamePart || firstName.Any(char.IsControl) || lastName.Any(char.IsControl))
            throw new UseCaseException(ErrorKind.Validation, "profile_name_invalid", "Ad 1–50, soyad en çok 50 karakter olmalı.");
        Version(await Required(user, ct), version);
        var displayName = lastName.Length == 0 ? firstName : $"{firstName} {lastName}";
        if (!await store.NameAsync(user, version, firstName, lastName, displayName, ct)) throw Conflict();
        return await ReadAsync(user, ct);
    }
    public async Task<ProfileView> UploadAsync(Guid user, long version, Guid photoId, string mediaType, string content, CancellationToken ct)
    {
        var before = await Required(user, ct); Version(before, version);
        if (!photos.Enabled) throw new UseCaseException(ErrorKind.Unavailable, "profile_photo_disabled", "Fotoğraf yükleme şu an kullanılamıyor.");
        if (photoId == Guid.Empty || before.ProfilePhotoRevision == photoId || content.Length > MaxBase64Length)
            throw InvalidPhoto();
        byte[] bytes;
        try { bytes = Convert.FromBase64String(content); } catch (FormatException) { throw InvalidPhoto(); }
        if (bytes.Length is < 12 or > MaxPhotoBytes || !Matches(bytes, mediaType)) throw InvalidPhoto();
        // Dosya kimliğini sunucu verir. İki ayrı deneme yanlışlıkla aynı dosyayı temizlemesin.
        var assetId = Guid.NewGuid();
        var uploaded = await photos.UploadAsync(user, assetId, bytes, mediaType, ct);
        // DB yanıtı belirsizse yeni fotoğrafı bırak. Kayıt aslında yapılmış olabilir.
        if (!await store.PhotoAsync(user, version, assetId, uploaded.CloudVersion, photoId, ct))
        {
            await Cleanup(user, assetId);
            throw Conflict();
        }
        if (before.ProfilePhotoId is { } old) await Cleanup(user, old);
        return await ReadAsync(user, ct);
    }
    public async Task<ProfileView> RemoveAsync(Guid user, long version, CancellationToken ct)
    {
        var before = await Required(user, ct); Version(before, version);
        if (before.ProfilePhotoId is null) return View(before);
        // Fotoğraf bağını önce CAS ile kaldır. Arada ad değişirse silinen fotoğrafı geri bağlamasın.
        if (!await store.PhotoAsync(user, version, null, null, null, ct)) throw Conflict();
        await Cleanup(user, before.ProfilePhotoId.Value);
        return await ReadAsync(user, ct);
    }
    public async Task<byte[]> PhotoAsync(Guid user, Guid version, CancellationToken ct)
    {
        var profile = await Required(user, ct);
        if (version == Guid.Empty || profile.ProfilePhotoRevision != version || profile.ProfilePhotoId is not { } assetId || profile.ProfilePhotoCloudVersion is not { } cloudVersion)
            throw new UseCaseException(ErrorKind.NotFound, "profile_photo_not_found", "Profil fotoğrafı bulunamadı.");
        return await photos.ReadAsync(user, assetId, cloudVersion, ct);
    }
    private async Task Cleanup(Guid user, Guid photo)
    {
        try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8)); await photos.DeleteAsync(user, photo, timeout.Token); }
        catch { /* Bağsız fotoğraf kalabilir. Onaylanmış profil kaydını geri alma. */ }
    }
    private static UseCaseException InvalidPhoto() => new(ErrorKind.Validation, "profile_photo_invalid", "En fazla 2 MB boyutunda bir JPEG, PNG veya WebP fotoğraf seç.");
    private static bool Matches(byte[] data, string mediaType) => mediaType switch
    {
        "image/jpeg" => data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff,
        "image/png" => data.AsSpan(0, 8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }),
        "image/webp" => data.AsSpan(0, 4).SequenceEqual("RIFF"u8) && data.AsSpan(8, 4).SequenceEqual("WEBP"u8),
        _ => false
    };
}
