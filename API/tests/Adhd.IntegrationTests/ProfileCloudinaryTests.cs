using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Adhd.Application.Auth;
using Adhd.Infrastructure.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class RealProfileFactAttribute : FactAttribute
{
    public RealProfileFactAttribute() { if (Environment.GetEnvironmentVariable("ADHD_REAL_PROFILE") != "1") Skip = "Explicit real Cloudinary profile smoke only."; }
}
public sealed class ProfileCloudinaryTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [RealProfileFact]
    public async Task SyntheticPhotoUploadsPrivatelyUnderOwnerFolderAndCanBeReadAndRemoved()
    {
        var envFile = Environment.GetEnvironmentVariable("ADHD_CLOUDINARY_ENV_FILE") ?? throw new InvalidOperationException("Cloudinary env file is required.");
        var config = File.ReadAllLines(envFile).Where(x => !string.IsNullOrWhiteSpace(x) && !x.StartsWith('#')).Select(x => x.Split('=', 2)).ToDictionary(x => x[0], x => x[1]);
        var assets = new ConcurrentBag<(Guid User, Guid Photo)>();
        await using var app = new PlannerFactory(fixture.ConnectionString, services =>
        {
            services.PostConfigure<CloudinarySettings>(o => { o.Enabled = true; o.CloudName = config["Cloudinary__CloudName"]; o.ApiKey = config["Cloudinary__ApiKey"]; o.ApiSecret = config["Cloudinary__ApiSecret"]; });
            services.RemoveAll<IProfilePhotos>(); services.AddSingleton<IProfilePhotos>(s => new RecordingPhotos(s.GetRequiredService<CloudinaryPhotos>(), assets));
        });
        using var client = app.CreateClient(); var auth = await ProfileTests.SignIn(client);
        var provider = app.Services.GetRequiredService<CloudinaryPhotos>();
        try
        {
            var response = await client.PutAsJsonAsync("/api/account/profile/photo", ProfileTests.Upload(auth.User.Id, 1));
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var profile = (await response.Content.ReadFromJsonAsync<ProfileView>())!;
            var photo = await client.GetAsync($"/api/account/profile/photo?version={profile.User.PhotoVersion}");
            Assert.Equal(HttpStatusCode.OK, photo.StatusCode); Assert.Equal("image/jpeg", photo.Content.Headers.ContentType!.MediaType);
            var data = await photo.Content.ReadAsByteArrayAsync(); Assert.True(data.Length > 20); Assert.Equal(255, data[0]); Assert.Equal(216, data[1]);
            await using var db = fixture.CreateContext(); var saved = await db.Users.AsNoTracking().SingleAsync(x => x.Id == auth.User.Id);
            Assert.StartsWith($"p1/{auth.User.Id:D}/", CloudinaryPhotos.PublicId(auth.User.Id, saved.ProfilePhotoId!.Value));
            using var admin = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(12) };
            admin.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(config["Cloudinary__ApiKey"] + ":" + config["Cloudinary__ApiSecret"])));
            var resourceUrl = $"https://api.cloudinary.com/v1_1/{config["Cloudinary__CloudName"]}/resources/image/authenticated/{Uri.EscapeDataString(CloudinaryPhotos.PublicId(auth.User.Id, saved.ProfilePhotoId.Value))}";
            using var resource = await admin.GetAsync(resourceUrl); Assert.Equal(HttpStatusCode.OK, resource.StatusCode);
            using var metadata = JsonDocument.Parse(await resource.Content.ReadAsStringAsync());
            if (metadata.RootElement.TryGetProperty("asset_folder", out var folder)) Assert.Equal($"p1/{auth.User.Id:D}", folder.GetString());
            using var publicClient = new HttpClient(new SocketsHttpHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(12) };
            var unsigned = await publicClient.GetAsync($"https://res.cloudinary.com/{config["Cloudinary__CloudName"]}/image/authenticated/v{saved.ProfilePhotoCloudVersion}/{CloudinaryPhotos.PublicId(auth.User.Id, saved.ProfilePhotoId.Value)}.jpg");
            Assert.False(unsigned.IsSuccessStatusCode);
            var removed = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/account/profile/photo") { Content = JsonContent.Create(new { expectedUserId = auth.User.Id, version = profile.User.ProfileVersion }) });
            Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/account/profile/photo?version={profile.User.PhotoVersion}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync(resourceUrl)).StatusCode);
        }
        finally
        {
            foreach (var asset in assets) { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12)); await provider.DeleteAsync(asset.User, asset.Photo, timeout.Token); }
        }
    }
    private sealed class RecordingPhotos(CloudinaryPhotos provider, ConcurrentBag<(Guid User, Guid Photo)> assets) : IProfilePhotos
    {
        public bool Enabled => provider.Enabled;
        public Task<ProfilePhoto> UploadAsync(Guid user, Guid photo, byte[] bytes, string mediaType, CancellationToken ct) { assets.Add((user, photo)); return provider.UploadAsync(user, photo, bytes, mediaType, ct); }
        public Task<byte[]> ReadAsync(Guid user, Guid photo, long cloudVersion, CancellationToken ct) => provider.ReadAsync(user, photo, cloudVersion, ct);
        public Task DeleteAsync(Guid user, Guid photo, CancellationToken ct) => provider.DeleteAsync(user, photo, ct);
    }
}
