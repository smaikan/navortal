using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Adhd.Application.Auth;
using Adhd.Infrastructure.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class ProfileTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    public static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==");
    private PlannerFactory App(FakePhotos photos) => new(fixture.ConnectionString, s => { s.RemoveAll<IProfilePhotos>(); s.AddSingleton<IProfilePhotos>(photos); });
    internal static async Task<AuthResponse> SignIn(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = $"profile-{Guid.NewGuid():N}@example.test", password = "profile-test-password" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return auth;
    }
    internal static object Upload(Guid owner, long version, Guid? uploadId = null, string type = "image/png", byte[]? bytes = null) => new { expectedUserId = owner, version, uploadId = uploadId ?? Guid.NewGuid(), mediaType = type, contentBase64 = Convert.ToBase64String(bytes ?? Png) };

    [Fact] public async Task NameIsTrimmedPersistedAndVersionedAndCannotChangeAnotherUser()
    {
        await using var app = App(new()); using var client = app.CreateClient(); using var other = app.CreateClient();
        var owner = await SignIn(client); var stranger = await SignIn(other);
        // Parolayla kayıtta görünen ad e-posta. Ad ve soyad ayrı alanlarda boş.
        var initial = (await client.GetFromJsonAsync<ProfileView>("/api/account/profile"))!;
        Assert.Equal("", initial.FirstName); Assert.Equal("", initial.LastName);
        var saved = await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 1, firstName = "  Deniz  ", lastName = "  Yılmaz ", userId = stranger.User.Id });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var result = (await saved.Content.ReadFromJsonAsync<ProfileView>())!;
        Assert.Equal("Deniz Yılmaz", result.User.DisplayName); Assert.Equal(2, result.User.ProfileVersion);
        Assert.Equal("Deniz", result.FirstName); Assert.Equal("Yılmaz", result.LastName);
        Assert.Equal("Deniz Yılmaz", (await client.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.DisplayName);
        Assert.Equal(stranger.User.DisplayName, (await other.GetFromJsonAsync<ProfileView>("/api/account/profile"))!.User.DisplayName);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 1, firstName = "Old" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 2, firstName = "   " })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 2, firstName = "a\nb" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 2, firstName = "Deniz", lastName = new string('y', 51) })).StatusCode);
        // Soyad boşsa görünen ad sadece ad olsun. Sonda boşluk kalmasın.
        var onlyFirst = (await (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 2, firstName = "Ayşe Nur", lastName = "" })).Content.ReadFromJsonAsync<ProfileView>())!;
        Assert.Equal("Ayşe Nur", onlyFirst.User.DisplayName); Assert.Equal("Ayşe Nur", onlyFirst.FirstName); Assert.Equal("", onlyFirst.LastName);
        await using var db = fixture.CreateContext();
        var row = await db.Users.SingleAsync(x => x.Id == owner.User.Id);
        Assert.Equal(("Ayşe Nur", "", "Ayşe Nur"), (row.FirstName, row.LastName, row.DisplayName));
    }
    [Fact] public async Task LegacyDisplayNameIsShownWholeAsFirstNameWithoutGuessingASurname()
    {
        await using var app = App(new()); using var client = app.CreateClient();
        var owner = await SignIn(client);
        await using (var db = fixture.CreateContext())
            await db.Users.Where(x => x.Id == owner.User.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.DisplayName, "Ali Veli Kaya").SetProperty(x => x.FirstName, (string?)null).SetProperty(x => x.LastName, (string?)null));
        var view = (await client.GetFromJsonAsync<ProfileView>("/api/account/profile"))!;
        Assert.Equal("Ali Veli Kaya", view.FirstName); Assert.Equal("", view.LastName);
    }
    [Fact] public async Task PhotosAreOwnerScopedPrivateVersionedReplacedAndRemoved()
    {
        var photos = new FakePhotos(); await using var app = App(photos);
        using var client = app.CreateClient(); using var other = app.CreateClient();
        var owner = await SignIn(client); await SignIn(other);
        var id = Guid.NewGuid(); var response = await client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 1, id));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var first = (await response.Content.ReadFromJsonAsync<ProfileView>())!;
        Assert.Equal(id, first.User.PhotoVersion); Assert.Equal(2, first.User.ProfileVersion);
        var stored = Assert.Single(photos.Assets.Keys); Assert.Equal(owner.User.Id, stored.User); Assert.NotEqual(id, stored.Photo);
        var image = await client.GetAsync($"/api/account/profile/photo?version={id}");
        Assert.Equal(HttpStatusCode.OK, image.StatusCode); Assert.Equal("image/jpeg", image.Content.Headers.ContentType!.MediaType);
        Assert.Contains("no-store", image.Headers.CacheControl!.ToString()); Assert.Equal("nosniff", Assert.Single(image.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/account/profile/photo?version={id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/account/profile/photo?version={Guid.NewGuid()}")).StatusCode);
        var second = await client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 2)); Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.DoesNotContain(stored, photos.Assets.Keys); Assert.Single(photos.Assets);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/account/profile/photo?version={id}")).StatusCode);
        var removed = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/account/profile/photo") { Content = JsonContent.Create(new { expectedUserId = owner.User.Id, version = 3 }) });
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode); Assert.Null((await removed.Content.ReadFromJsonAsync<ProfileView>())!.User.PhotoVersion); Assert.Empty(photos.Assets);
    }
    [Fact] public async Task InvalidMimeMagicOversizeAndProviderFailureNeverChangeTheProfile()
    {
        var photos = new FakePhotos(); await using var app = App(photos); using var client = app.CreateClient(); var owner = await SignIn(client);
        foreach (var body in new[] { Upload(owner.User.Id, 1, type: "image/svg+xml"), Upload(owner.User.Id, 1, type: "image/jpeg"), Upload(owner.User.Id, 1, bytes: new byte[ProfileService.MaxPhotoBytes + 1]), Upload(owner.User.Id, 1, uploadId: Guid.Empty) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/account/profile/photo", body)).StatusCode);
        Assert.Equal(0, photos.UploadCount);
        photos.Fail = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 1))).StatusCode);
        var profile = (await client.GetFromJsonAsync<ProfileView>("/api/account/profile"))!; Assert.Equal(1, profile.User.ProfileVersion); Assert.Null(profile.User.PhotoVersion);
    }
    [Fact] public async Task ConcurrentNameChangeRejectsAndCleansOnlyTheNewUnreferencedPhoto()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var photos = new FakePhotos { BeforeReturn = async () => { entered.TrySetResult(); await release.Task; } };
        await using var app = App(photos); using var client = app.CreateClient(); var owner = await SignIn(client);
        var pending = client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 1));
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 1, firstName = "Güncel", lastName = "İsim" })).StatusCode);
        release.SetResult(); Assert.Equal(HttpStatusCode.Conflict, (await pending).StatusCode); Assert.Empty(photos.Assets);
        Assert.Equal("Güncel İsim", (await client.GetFromJsonAsync<ProfileView>("/api/account/profile"))!.User.DisplayName);
    }
    [Fact] public async Task DuplicateUploadIntentHasDistinctServerAssetsAndTheLoserCannotDeleteTheWinner()
    {
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var arrived = 0;
        var photos = new FakePhotos { BeforeReturn = async () => { if (Interlocked.Increment(ref arrived) == 2) ready.TrySetResult(); await ready.Task; } };
        await using var app = App(photos); using var client = app.CreateClient(); var owner = await SignIn(client);
        var body = Upload(owner.User.Id, 1, Guid.NewGuid());
        var responses = await Task.WhenAll(client.PutAsJsonAsync("/api/account/profile/photo", body), client.PutAsJsonAsync("/api/account/profile/photo", body));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.OK); Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Conflict);
        Assert.Single(photos.Assets);
        var current = (await client.GetFromJsonAsync<ProfileView>("/api/account/profile"))!;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/account/profile/photo?version={current.User.PhotoVersion}")).StatusCode);
    }
    [Fact] public async Task AnonymousAndCookieCsrfRequestsAreRejectedBeforePhotoProvider()
    {
        var photos = new FakePhotos(); await using var app = App(photos); using var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/account/profile")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync($"/api/account/profile/photo?version={Guid.NewGuid()}")).StatusCode);
        var auth = await SignIn(client); var owner = auth; client.DefaultRequestHeaders.Authorization = null;
        client.DefaultRequestHeaders.Add("Cookie", $"adhd_session={auth.AccessToken}"); client.DefaultRequestHeaders.Add("Origin", "http://localhost");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 1))).StatusCode);
        Assert.Equal(0, photos.UploadCount);
        client.DefaultRequestHeaders.Add("X-ADHD-CSRF", "1"); client.DefaultRequestHeaders.Remove("Origin"); client.DefaultRequestHeaders.Add("Origin", "https://foreign.example.test");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 1, firstName = "Forged" })).StatusCode);
    }
    [Fact] public async Task AChangedCookieOwnerCannotWriteAnotherAccountsProfileEvenAtTheSameVersion()
    {
        var photos = new FakePhotos(); await using var app = App(photos);
        using var client = app.CreateClient(); using var other = app.CreateClient();
        var owner = await SignIn(client); var stranger = await SignIn(other);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", stranger.AccessToken);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = owner.User.Id, version = 1, firstName = "Wrong", lastName = "owner" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync("/api/account/profile/photo", Upload(owner.User.Id, 1))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/account/profile/photo") { Content = JsonContent.Create(new { expectedUserId = owner.User.Id, version = 1 }) })).StatusCode);
        Assert.Equal(0, photos.UploadCount);
        Assert.Equal(stranger.User.DisplayName, (await other.GetFromJsonAsync<ProfileView>("/api/account/profile"))!.User.DisplayName);
    }
    public sealed class FakePhotos : IProfilePhotos
    {
        public bool Enabled => true;
        public bool Fail { get; set; }
        public int UploadCount;
        public Func<Task>? BeforeReturn { get; set; }
        public ConcurrentDictionary<(Guid User, Guid Photo), byte[]> Assets { get; } = new();
        public async Task<ProfilePhoto> UploadAsync(Guid user, Guid photo, byte[] bytes, string mediaType, CancellationToken ct)
        {
            Interlocked.Increment(ref UploadCount);
            if (Fail) throw new Adhd.Application.Common.UseCaseException(Adhd.Application.Common.ErrorKind.Unavailable, "test_photo_unavailable", "Fotoğraf hizmeti kullanılamıyor.");
            Assets[(user, photo)] = [255, 216, 255, 217];
            if (BeforeReturn is { } wait) await wait().WaitAsync(TimeSpan.FromSeconds(10), ct);
            return new(1);
        }
        public Task<byte[]> ReadAsync(Guid user, Guid photo, long cloudVersion, CancellationToken ct) => Task.FromResult(Assets[(user, photo)]);
        public Task DeleteAsync(Guid user, Guid photo, CancellationToken ct) { Assets.TryRemove((user, photo), out _); return Task.CompletedTask; }
    }
}
