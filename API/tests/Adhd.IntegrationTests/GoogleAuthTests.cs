using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Api.Auth;
using Adhd.Api.Controllers;
using Adhd.Application.Auth;
using Adhd.Application.Common;
using Adhd.Infrastructure.Auth;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Adhd.IntegrationTests;

public sealed class GoogleAuthTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private const string Password = "existing-password";
    private sealed class Proofs : IGoogleTokenVerifier
    {
        public ConcurrentDictionary<string, GoogleIdentity> Values { get; } = new();
        public Task<GoogleIdentity> VerifyAsync(string credential, CancellationToken ct) =>
            Values.TryGetValue(credential, out var proof) ? Task.FromResult(proof)
                : throw new UseCaseException(ErrorKind.Unauthenticated, "google_invalid", "Invalid test proof");
    }
    private PlannerFactory App(Proofs proofs, bool enabled = true, string clientId = "test.apps.googleusercontent.com", int permitLimit = 30) =>
        new(fixture.ConnectionString, services =>
        {
            services.PostConfigure<GoogleSettings>(o => { o.Enabled = enabled; o.ClientId = clientId; });
            services.PostConfigure<AuthRegistration.AuthRateLimitSettings>(o => o.PermitLimit = permitLimit);
            services.RemoveAll<IGoogleTokenVerifier>(); services.AddSingleton<IGoogleTokenVerifier>(proofs);
        });
    private static HttpClient Browser(PlannerFactory app) => app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });
    private static GoogleIdentity Identity(string? email = null) => new(Guid.NewGuid().ToString("N"), email ?? $"{Guid.NewGuid():N}@gmail.com", "Ada Lovelace", true,
        "Ada", "Lovelace", "https://lh3.googleusercontent.com/a/test-photo");
    private static async Task<string> BrowserProof(HttpClient browser, Proofs proofs, GoogleIdentity identity)
    {
        var config = (await browser.GetFromJsonAsync<GoogleAuthConfigView>("/api/auth/google/config"))!;
        Assert.True(config.Enabled); Assert.NotNull(config.Nonce);
        var key = Guid.NewGuid().ToString("N"); proofs.Values[key] = identity with { Nonce = config.Nonce };
        return key;
    }
    private static HttpRequestMessage Post(string path, string token, Guid? owner = null, bool csrf = true, string? origin = "http://localhost")
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(new { idToken = token, expectedUserId = owner }) };
        if (csrf) request.Headers.Add(SessionCookie.CsrfHeader, "1");
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }
    private static async Task<AuthResponse> Register(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password = Password });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    [Fact]
    public async Task BrowserCreatesProfileAndHttpOnlySessionWithoutExposingTokens()
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var browser = Browser(app);
        var proof = Identity(); var token = await BrowserProof(browser, proofs, proof);
        var response = await browser.SendAsync(Post("/api/auth/session/google", token));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var raw = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("accessToken", raw); Assert.DoesNotContain("idToken", raw);
        Assert.True(response.Headers.CacheControl!.NoStore);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), x => x.StartsWith("adhd_session=") && x.Contains("httponly", StringComparison.OrdinalIgnoreCase) && x.Contains("samesite=strict", StringComparison.OrdinalIgnoreCase));
        var user = (await response.Content.ReadFromJsonAsync<UserSummary>())!;
        var profile = (await browser.GetFromJsonAsync<ProfileView>("/api/account/profile"))!;
        Assert.Equal(user.Id, profile.User.Id); Assert.Equal(proof.Email, user.Email);
        Assert.False(profile.HasPassword); Assert.True(profile.GoogleLinked);
        Assert.Equal("Ada", profile.FirstName); Assert.Equal("Lovelace", profile.LastName); Assert.Equal(proof.Picture, user.GooglePictureUrl);
        await using var db = fixture.CreateContext();
        Assert.Null((await db.Users.SingleAsync(x => x.Id == user.Id)).PasswordHash);
        Assert.True(await db.PlanningStates.AnyAsync(x => x.UserId == user.Id));
        Assert.True(await db.NoteCategories.AnyAsync(x => x.UserId == user.Id));
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.SendAsync(Post("/api/auth/session/google", token))).StatusCode);
    }

    [Theory]
    [InlineData("gmail.com", null)]
    [InlineData("company.test", "company.test")]
    public async Task AuthoritativeEmailLinksSameIdPreservingPasswordAndData(string domain, string? hd)
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var client = app.CreateClient();
        var email = $"{Guid.NewGuid():N}@{domain}"; var old = await Register(client, email);
        client.DefaultRequestHeaders.Authorization = new("Bearer", old.AccessToken);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/tasks", new { title = "existing task" })).StatusCode);
        var proof = Identity(email.ToUpperInvariant()) with { HostedDomain = hd };
        using var browser = Browser(app); var token = await BrowserProof(browser, proofs, proof);
        var response = await browser.SendAsync(Post("/api/auth/session/google", token));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var merged = (await response.Content.ReadFromJsonAsync<UserSummary>())!;
        Assert.Equal(old.User.Id, merged.Id); Assert.Equal(email, merged.Email);
        Assert.Equal("Ada Lovelace", merged.DisplayName); Assert.Equal(2, merged.ProfileVersion); Assert.Equal(proof.Picture, merged.GooglePictureUrl);
        using var passwordClient = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await passwordClient.PostAsJsonAsync("/api/auth/login", new { email, password = Password })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(1, await db.Users.CountAsync(x => x.NormalizedEmail == email.ToUpperInvariant()));
        Assert.True(await db.Tasks.AnyAsync(x => x.UserId == old.User.Id && x.Title == "existing task"));
        Assert.Equal(old.User.Id, (await db.ExternalLogins.SingleAsync(x => x.Subject == proof.Subject)).UserId);
    }

    [Fact]
    public async Task ThirdPartyEmailRequiresExistingLoginThenExplicitOwnerBoundLink()
    {
        var proofs = new Proofs(); await using var app = App(proofs);
        var proof = Identity($"{Guid.NewGuid():N}@example.test"); using var browser = Browser(app);
        var old = await Register(browser, proof.Email);
        var token = await BrowserProof(browser, proofs, proof);
        var denied = await browser.SendAsync(Post("/api/auth/session/google", token));
        Assert.Equal(HttpStatusCode.Conflict, denied.StatusCode); Assert.Contains("google_link_required", await denied.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await browser.SendAsync(Post("/api/auth/google/link", token, Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Post("/api/auth/google/link", token, old.User.Id, csrf: false))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await browser.SendAsync(Post("/api/auth/google/link", token, old.User.Id))).StatusCode);
        using var otherBrowser = Browser(app); token = await BrowserProof(otherBrowser, proofs, proof);
        var login = await otherBrowser.SendAsync(Post("/api/auth/session/google", token));
        Assert.Equal(old.User.Id, (await login.Content.ReadFromJsonAsync<UserSummary>())!.Id);
    }

    [Fact]
    public async Task InvalidLinkChallengeIsABadRequestAndKeepsTheExistingSession()
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var browser = Browser(app);
        var old = await Register(browser, $"{Guid.NewGuid():N}@example.test");
        var token = await BrowserProof(browser, proofs, Identity());
        proofs.Values[token] = proofs.Values[token] with { Nonce = "wrong" };
        var response = await browser.SendAsync(Post("/api/auth/google/link", token, old.User.Id));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(old.User.Id, (await browser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        await using var db = fixture.CreateContext(); Assert.False(await db.ExternalLogins.AnyAsync(x => x.UserId == old.User.Id));
    }

    [Fact]
    public async Task ExistingSubjectKeepsEditedProfileAndRemovedPictureEvenIfGoogleEmailChanges()
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var client = app.CreateClient();
        var proof = Identity(); proofs.Values["first"] = proof;
        var created = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "first" });
        var auth = (await created.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", auth.AccessToken);
        var edit = await client.PutAsJsonAsync("/api/account/profile", new { expectedUserId = auth.User.Id, version = 1, firstName = "My Name", lastName = "My Surname" });
        Assert.Equal(HttpStatusCode.OK, edit.StatusCode);
        var remove = await client.SendAsync(new HttpRequestMessage(HttpMethod.Delete, "/api/account/profile/photo") { Content = JsonContent.Create(new { expectedUserId = auth.User.Id, version = 2 }) });
        Assert.Equal(HttpStatusCode.OK, remove.StatusCode);
        proofs.Values["changed"] = proof with { Email = $"{Guid.NewGuid():N}@gmail.com", GivenName = "Changed" };
        var login = await app.CreateClient().PostAsJsonAsync("/api/auth/google", new { idToken = "changed" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var current = (await login.Content.ReadFromJsonAsync<AuthResponse>())!.User;
        Assert.Equal(auth.User.Id, current.Id); Assert.Equal(proof.Email, current.Email);
        Assert.Equal("My Name My Surname", current.DisplayName); Assert.Null(current.GooglePictureUrl); Assert.Equal(3, current.ProfileVersion);
        var second = await Register(app.CreateClient(), $"{Guid.NewGuid():N}@example.test");
        using var secondClient = app.CreateClient(); secondClient.DefaultRequestHeaders.Authorization = new("Bearer", second.AccessToken);
        Assert.Equal(HttpStatusCode.Conflict, (await secondClient.PostAsJsonAsync("/api/auth/google/link", new { idToken = "changed" })).StatusCode);
    }

    [Theory]
    [InlineData("missing-cookie")]
    [InlineData("malformed-cookie")]
    [InlineData("mismatch")]
    [InlineData("expired")]
    [InlineData("missing-nonce")]
    [InlineData("unverified")]
    [InlineData("invalid-proof")]
    public async Task InvalidChallengeOrProofCannotCreateAccounts(string failure)
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var browser = Browser(app);
        var proof = Identity(); var token = await BrowserProof(browser, proofs, proof);
        if (failure is "missing-cookie" or "malformed-cookie")
        {
            using var fresh = app.CreateClient();
            if (failure == "malformed-cookie") fresh.DefaultRequestHeaders.Add("Cookie", "adhd_google_challenge=%%%");
            Assert.Equal(HttpStatusCode.Unauthorized, (await fresh.SendAsync(Post("/api/auth/session/google", token))).StatusCode);
        }
        else
        {
            if (failure == "expired") app.Clock.Now += GoogleChallenge.Lifetime;
            if (failure == "mismatch") proofs.Values[token] = proof with { Nonce = "wrong" };
            if (failure == "missing-nonce") proofs.Values[token] = proof;
            if (failure == "unverified") proofs.Values[token] = proofs.Values[token] with { EmailVerified = false };
            if (failure == "invalid-proof") token = "not-known";
            Assert.Equal(HttpStatusCode.Unauthorized, (await browser.SendAsync(Post("/api/auth/session/google", token))).StatusCode);
        }
        await using var db = fixture.CreateContext();
        Assert.False(await db.ExternalLogins.AnyAsync(x => x.Subject == proof.Subject));
        Assert.False(await db.Users.AnyAsync(x => x.Email == proof.Email));
    }

    [Theory]
    [InlineData(false, "http://localhost")]
    [InlineData(true, null)]
    [InlineData(true, "https://evil.test")]
    public async Task AnonymousGoogleLoginRequiresSameOriginAndCsrfHeader(bool csrf, string? origin)
    {
        var proofs = new Proofs(); await using var app = App(proofs); using var browser = Browser(app);
        var proof = Identity(); var token = await BrowserProof(browser, proofs, proof);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Post("/api/auth/session/google", token, csrf: csrf, origin: origin))).StatusCode);
        await using var db = fixture.CreateContext(); Assert.False(await db.ExternalLogins.AnyAsync(x => x.Subject == proof.Subject));
    }

    [Theory]
    [InlineData(false, "test.apps.googleusercontent.com")]
    [InlineData(true, "")]
    public async Task MissingConfigurationHidesGoogleAndDisablesBrowserLogin(bool enabled, string clientId)
    {
        var proofs = new Proofs(); await using var app = App(proofs, enabled, clientId); using var client = Browser(app);
        var configResponse = await client.GetAsync("/api/auth/google/config"); Assert.True(configResponse.Headers.CacheControl!.NoStore);
        var config = (await configResponse.Content.ReadFromJsonAsync<GoogleAuthConfigView>())!;
        Assert.False(config.Enabled); Assert.Null(config.Nonce); Assert.Null(config.ClientId);
        Assert.False(configResponse.Headers.Contains("Set-Cookie"));
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.SendAsync(Post("/api/auth/session/google", "unused"))).StatusCode);
    }

    [Fact]
    public async Task ReadingGoogleConfigDoesNotConsumeTheLoginRateLimit()
    {
        var proofs = new Proofs(); await using var app = App(proofs, permitLimit: 1); using var browser = Browser(app);
        await browser.GetFromJsonAsync<GoogleAuthConfigView>("/api/auth/google/config");
        var token = await BrowserProof(browser, proofs, Identity());
        Assert.Equal(HttpStatusCode.OK, (await browser.SendAsync(Post("/api/auth/session/google", token))).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await browser.SendAsync(Post("/api/auth/session/google", token))).StatusCode);
    }

    [Fact]
    public async Task ConcurrentGoogleRegistrationsCreateOnlyOneOwnerAndExternalIdentity()
    {
        var proofs = new Proofs(); await using var app = App(proofs); var proof = Identity(); proofs.Values["race"] = proof;
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ =>
        {
            using var client = app.CreateClient(); return await client.PostAsJsonAsync("/api/auth/google", new { idToken = "race" });
        }));
        foreach (var response in responses) Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var ids = await Task.WhenAll(responses.Select(async response => (await response.Content.ReadFromJsonAsync<AuthResponse>())!.User.Id));
        Assert.Single(ids.Distinct());
        await using var db = fixture.CreateContext();
        Assert.Equal(1, await db.ExternalLogins.CountAsync(x => x.Subject == proof.Subject));
        Assert.Equal(1, await db.Users.CountAsync(x => x.NormalizedEmail == proof.Email.ToUpperInvariant()));
    }
}
