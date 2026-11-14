using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Adhd.Application.Common;
using Adhd.Infrastructure.Auth;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Caching.Memory;

namespace Adhd.IntegrationTests;

public sealed class PasswordChangeTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private const string Path = "/api/auth/change-password";
    private static HttpClient Browser(PlannerFactory app) => app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
    private static async Task<UserSummary> Register(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/auth/session/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<UserSummary>())!;
    }
    private static HttpRequestMessage Change(Guid owner, string current = "123456", string next = "abcdef", bool csrf = true, string origin = "http://localhost")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Path) { Content = JsonContent.Create(new { expectedUserId = owner, currentPassword = current, newPassword = next }) };
        request.Headers.Add("Origin", origin);
        if (csrf) request.Headers.Add("X-ADHD-CSRF", "1");
        return request;
    }

    [Fact]
    public async Task ChangeRotatesCurrentCookieRevokesOldCopiesAndOtherSessionsAndResetLinksOnlyForOwner()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        var second = Browser(app);
        await second.PostAsJsonAsync("/api/auth/session/login", new { email = owner.Email, password = "123456" });
        var stranger = Browser(app); var strangerUser = await Register(stranger);
        var token = new string('A', 64);
        await using (var db = fixture.CreateContext())
        {
            db.PasswordResets.Add(new PasswordResetRequest { Id = Guid.CreateVersion7(), UserId = owner.Id, TokenHash = PasswordResetService.Hash(token), CreatedAt = app.Clock.Now, ExpiresAt = app.Clock.Now.AddMinutes(30) });
            await db.SaveChangesAsync();
        }
        var before = await browser.PostAsJsonAsync("/api/auth/login", new { email = owner.Email, password = "123456" });
        var old = (await before.Content.ReadFromJsonAsync<AuthResponse>())!;
        var copy = app.CreateClient(); copy.DefaultRequestHeaders.Authorization = new("Bearer", old.AccessToken);
        await copy.GetAsync("/api/auth/me"); await second.GetAsync("/api/auth/me"); // warm session caches
        var changed = await browser.SendAsync(Change(owner.Id));
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var json = JsonDocument.Parse(await changed.Content.ReadAsStringAsync());
        Assert.False(json.RootElement.TryGetProperty("accessToken", out _));
        Assert.Contains("httponly", changed.Headers.GetValues("Set-Cookie").Single(), StringComparison.OrdinalIgnoreCase);
        Assert.True(changed.Headers.CacheControl!.NoStore);
        Assert.Equal(owner.Id, (await browser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        Assert.Equal(HttpStatusCode.Unauthorized, (await copy.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(strangerUser.Id, (await stranger.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PostAsJsonAsync("/api/auth/session/login", new { email = owner.Email, password = "123456" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().PostAsJsonAsync("/api/auth/session/login", new { email = owner.Email, password = "abcdef" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await app.CreateClient().PostAsJsonAsync("/api/auth/reset-password", new { token, newPassword = "resetx" })).StatusCode);
    }

    [Theory]
    [InlineData("wrong!", "abcdef", "current_password_invalid")]
    [InlineData("123456", "123456", "password_unchanged")]
    [InlineData("123456", "12345", "validation_failed")]
    public async Task InvalidInputKeepsPasswordAndSessions(string current, string next, string code)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        var response = await browser.SendAsync(Change(owner.Id, current, next));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal(code, body.RootElement.GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().PostAsJsonAsync("/api/auth/session/login", new { email = owner.Email, password = "123456" })).StatusCode);
    }

    [Fact]
    public async Task RequiresAuthenticationCsrfSameOriginAndMatchingExpectedAccount()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().SendAsync(Change(Guid.NewGuid()))).StatusCode);
        var browser = Browser(app); var owner = await Register(browser);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Change(owner.Id, csrf: false))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Change(owner.Id, origin: "https://evil.example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await browser.SendAsync(Change(Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ConcurrentChangesWithTheSameOldPasswordHaveOneWinner()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        var response = await browser.PostAsJsonAsync("/api/auth/login", new { email = owner.Email, password = "123456" });
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        var clients = Enumerable.Range(0, 2).Select(_ => app.CreateClient()).ToArray();
        foreach (var client in clients) client.DefaultRequestHeaders.Authorization = new("Bearer", auth.AccessToken);
        var results = await Task.WhenAll(clients.Select((client, i) => client.SendAsync(Change(owner.Id, next: $"next-{i}"))));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        Assert.All(results.Where(x => x.StatusCode != HttpStatusCode.OK), x => Assert.Contains(x.StatusCode, new[] { HttpStatusCode.BadRequest, HttpStatusCode.Conflict, HttpStatusCode.Unauthorized }));
        await using var db = fixture.CreateContext();
        Assert.Equal(1, await db.AuthSessions.CountAsync(x => x.UserId == owner.Id && x.RevokedAt == null));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FailedSessionInsertRollsBackPasswordResetLinksAndSessionRevocations(bool creating)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        string? oldHash; Guid sid;
        await using (var before = fixture.CreateContext())
        {
            var account = await before.Users.SingleAsync(x => x.Id == owner.Id);
            if (creating) account.PasswordHash = null;
            oldHash = account.PasswordHash;
            sid = await before.AuthSessions.Where(x => x.UserId == owner.Id).Select(x => x.Id).SingleAsync();
            before.PasswordResets.Add(new PasswordResetRequest { Id = Guid.CreateVersion7(), UserId = owner.Id, TokenHash = PasswordResetService.Hash(token), CreatedAt = app.Clock.Now, ExpiresAt = app.Clock.Now.AddMinutes(30) });
            await before.SaveChangesAsync();
        }
        await using (var failing = new PlannerDbContext(new DbContextOptionsBuilder<PlannerDbContext>().UseNpgsql(fixture.ConnectionString).AddInterceptors(new RejectSave()).Options))
        {
            var store = new PasswordChangeStore(failing, app.Services.GetRequiredService<IMemoryCache>());
            await Assert.ThrowsAsync<InvalidOperationException>(() => store.ChangeAsync(owner.Id, sid, oldHash, "replacement-hash", "Other", app.Clock.Now, default));
        }
        await using var after = fixture.CreateContext();
        Assert.Equal(oldHash, (await after.Users.SingleAsync(x => x.Id == owner.Id)).PasswordHash);
        Assert.Null((await after.AuthSessions.SingleAsync(x => x.Id == sid)).RevokedAt);
        Assert.Null((await after.PasswordResets.SingleAsync(x => x.UserId == owner.Id)).UsedAt);
        Assert.False(await after.AuthSessionCutoffs.AnyAsync(x => x.UserId == owner.Id));
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
    }

    private sealed class RejectSave : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
            => throw new InvalidOperationException("simulated_write_failure");
    }

    [Fact]
    public async Task ALoginVerifiedBeforeTheChangeCannotCreateASessionAfterIt()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        await using var scope = app.Services.CreateAsyncScope();
        var staleUser = (await scope.ServiceProvider.GetRequiredService<IUserStore>().FindByIdAsync(owner.Id, default))!;
        Assert.Equal(HttpStatusCode.OK, (await browser.SendAsync(Change(owner.Id))).StatusCode);
        var error = await Assert.ThrowsAsync<UseCaseException>(() => scope.ServiceProvider.GetRequiredService<AuthService>().StartAsync(staleUser, "Other", default));
        Assert.Equal("credentials_changed", error.Code);
        await using var db = fixture.CreateContext();
        Assert.Equal(1, await db.AuthSessions.CountAsync(x => x.UserId == owner.Id && x.RevokedAt == null));
    }

    [Fact]
    public async Task SixSpacesAreAcceptedWithoutTrimmingOrAddingComplexityRules()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var owner = await Register(browser);
        Assert.Equal(HttpStatusCode.OK, (await browser.SendAsync(Change(owner.Id, next: "      "))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await app.CreateClient().PostAsJsonAsync("/api/auth/session/login", new { email = owner.Email, password = "      " })).StatusCode);
    }
}
