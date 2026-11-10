using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Adhd.Api.Auth;
using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;

namespace Adhd.IntegrationTests;

// Gerçek PostgreSQL'de HttpOnly oturum, sid iptali, CSRF, çıkış/adopt ve kayan yenileme testleri.
public sealed class AuthSessionTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private const string Origin = "http://localhost";
    private static string Email() => $"{Guid.NewGuid():N}@example.test";
    private static HttpClient Browser(PlannerFactory app) => app.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = true });

    private static async Task<AuthResponse> Register(HttpClient client, string? email = null)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = email ?? Email(), password = "123456" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    private static HttpRequestMessage Unsafe(string path, object? body = null, bool csrf = true, string? origin = Origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = body is null ? null : JsonContent.Create(body) };
        if (csrf) request.Headers.Add(SessionCookie.CsrfHeader, "1");
        if (origin is not null) request.Headers.Add("Origin", origin);
        return request;
    }

    [Fact]
    public async Task BrowserSessionEndpointsReturnOnlyUserAndKeepCookieCsrfAndBearerCompatibility()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app);
        var email = Email();
        var created = await browser.PostAsJsonAsync("/api/auth/session/register", new { email, password = "123456" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var body = System.Text.Json.JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        Assert.Equal(new[] { "displayName", "email", "googlePictureUrl", "id", "photoVersion", "profileVersion" }, body.RootElement.EnumerateObject().Select(x => x.Name).Order().ToArray());
        var owner = (await browser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!;
        Assert.Equal(email, owner.Email);
        Assert.Contains("httponly", created.Headers.GetValues("Set-Cookie").Single(), StringComparison.OrdinalIgnoreCase);
        Assert.True(created.Headers.CacheControl!.NoStore);
        var loginBrowser = Browser(app);
        var login = await loginBrowser.PostAsJsonAsync("/api/auth/session/login", new { email, password = "123456" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var loginBody = System.Text.Json.JsonDocument.Parse(await login.Content.ReadAsStringAsync());
        Assert.Equal(body.RootElement.EnumerateObject().Select(x => x.Name).Order(), loginBody.RootElement.EnumerateObject().Select(x => x.Name).Order());
        Assert.Equal(owner.Id, (await loginBrowser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await loginBrowser.SendAsync(Unsafe("/api/tasks", new { title = "browser csrf" }, csrf: false))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await app.CreateClient().SendAsync(Unsafe("/api/auth/session/login", new { email, password = "123456" }, origin: "https://evil.example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await app.CreateClient().SendAsync(Unsafe("/api/auth/session/register", new { email = Email(), password = "123456" }, origin: "null"))).StatusCode);
        var bearer = await Register(app.CreateClient());
        var bearerClient = app.CreateClient(); bearerClient.DefaultRequestHeaders.Authorization = new("Bearer", bearer.AccessToken);
        Assert.Equal(bearer.User.Id, (await bearerClient.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
    }

    [Theory]
    [InlineData("Testing", "adhd_session", false)]
    [InlineData("Development", "adhd_session", false)]
    [InlineData("Production", "__Host-adhd_session", true)]
    public void CookieAttributesFollowTheLoopbackException(string environment, string name, bool secure)
    {
        var services = new ServiceCollection().AddSingleton<IHostEnvironment>(new Env(environment)).BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        SessionCookie.Write(context, "value");
        var header = context.Response.Headers.SetCookie.ToString();
        Assert.StartsWith(name + "=value", header);
        Assert.Contains("httponly", header, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", header, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/", header, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("max-age=34560000", header, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("domain=", header, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(secure, header.Contains("secure", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task RegisterAndLoginSetTheCookieWhichAloneAuthenticatesAndAnExplicitBearerWins()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app);
        var a = await Register(browser);
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        var b = await Register(app.CreateClient());
        // Bearer başlığı varsa cookie'den önce gelir. Bu istemcide CSRF işareti gerekmez
        browser.DefaultRequestHeaders.Authorization = new("Bearer", b.AccessToken);
        Assert.Equal(b.User.Id, (await browser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        Assert.Equal(HttpStatusCode.Created, (await browser.SendAsync(Unsafe("/api/tasks", new { title = "Bearer" }, csrf: false, origin: null))).StatusCode);
        browser.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(a.User.Id, (await browser.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        var bearerOnly = app.CreateClient();
        bearerOnly.DefaultRequestHeaders.Authorization = new("Bearer", b.AccessToken);
        Assert.Equal(b.User.Id, (await bearerOnly.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        var other = Browser(app);
        var login = await other.PostAsJsonAsync("/api/auth/login", new { email = a.User.Email, password = "123456" });
        Assert.Contains("adhd_session=", login.Headers.GetValues("Set-Cookie").Single());
        Assert.Equal(a.User.Id, (await other.GetFromJsonAsync<UserSummary>("/api/auth/me"))!.Id);
        Assert.Equal(2, await Sessions(a.User.Id));
    }

    [Fact]
    public async Task CookieWritesRequireTheCsrfHeaderAndASameHostOrigin()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app);
        await Register(browser);
        var task = new { title = "CSRF denemesi" };
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Unsafe("/api/tasks", task, csrf: false))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Unsafe("/api/tasks", task, origin: "https://evil.example.test"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Unsafe("/api/tasks", task, origin: "null"))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Unsafe("/api/tasks", task, origin: null))).StatusCode);
        var referer = Unsafe("/api/tasks", task, origin: null); referer.Headers.Referrer = new Uri("http://localhost/app/gorevler");
        Assert.Equal(HttpStatusCode.Created, (await browser.SendAsync(referer)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await browser.SendAsync(Unsafe("/api/tasks", task))).StatusCode);
        // UI proxy tarayıcıdaki host'u geçirir. API'nin kendi host'u farklı
        var proxied = Unsafe("/api/tasks", task, origin: "http://127.0.0.1:3400"); proxied.Headers.Add("X-Forwarded-Host", "127.0.0.1:3400");
        Assert.Equal(HttpStatusCode.Created, (await browser.SendAsync(proxied)).StatusCode);
        Assert.Equal(3, await TasksTitled("CSRF denemesi"));
        // Kayıt ve giriş cookie'deki kişi adına işlem yapmaz. Aynı host'tan CSRF işareti gerekmez.
        Assert.Equal(HttpStatusCode.Created, (await browser.SendAsync(Unsafe("/api/auth/register", new { email = Email(), password = "123456" }, csrf: false, origin: null))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await browser.SendAsync(Unsafe("/api/auth/logout", csrf: false))).StatusCode);
        // Bearer istemcisi otomatik kimlik taşımaz. Başka siteden gelen anonim yazı da reddedilir
        var api = app.CreateClient();
        var b = await Register(api);
        api.DefaultRequestHeaders.Authorization = new("Bearer", b.AccessToken);
        Assert.Equal(HttpStatusCode.Created, (await api.PostAsJsonAsync("/api/tasks", task)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await app.CreateClient().SendAsync(Unsafe("/api/auth/login", new { email = Email(), password = "123456" }, csrf: false, origin: "https://evil.example.test"))).StatusCode);
    }

    [Fact]
    public async Task LogoutRevokesTheSessionAndEveryCopyOfItsToken()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app);
        var auth = await Register(browser);
        var copy = app.CreateClient(); copy.DefaultRequestHeaders.Authorization = new("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await copy.GetAsync("/api/auth/me")).StatusCode);
        var logout = await browser.SendAsync(Unsafe("/api/auth/logout"));
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Contains("adhd_session=;", logout.Headers.GetValues("Set-Cookie").Single());
        Assert.Equal(HttpStatusCode.Unauthorized, (await copy.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/auth/me")).StatusCode);
        Assert.NotNull((await Session(auth))!.RevokedAt);
    }

    [Fact]
    public async Task LogoutAllEndsEverySessionOfOnlyThisAccount()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var first = Browser(app); var auth = await Register(first);
        var second = Browser(app);
        Assert.Equal(HttpStatusCode.OK, (await second.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "123456" })).StatusCode);
        var stranger = Browser(app); await Register(stranger);
        Assert.Equal(HttpStatusCode.NoContent, (await second.SendAsync(Unsafe("/api/auth/logout-all"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await stranger.GetAsync("/api/auth/me")).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(0, await db.AuthSessions.CountAsync(x => x.UserId == auth.User.Id && x.RevokedAt == null));
        Assert.NotNull(await db.AuthSessionCutoffs.SingleOrDefaultAsync(x => x.UserId == auth.User.Id));
    }

    [Fact]
    public async Task PasswordResetRevokesAllSessions()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var auth = await Register(browser);
        var resetToken = Convert.ToHexString(Guid.NewGuid().ToByteArray()) + Convert.ToHexString(Guid.NewGuid().ToByteArray());
        await using (var db = fixture.CreateContext())
        {
            db.PasswordResets.Add(new PasswordResetRequest { Id = Guid.CreateVersion7(), UserId = auth.User.Id, TokenHash = PasswordResetService.Hash(resetToken), CreatedAt = app.Clock.Now, ExpiresAt = app.Clock.Now.AddMinutes(30) });
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.NoContent, (await app.CreateClient().PostAsJsonAsync("/api/auth/reset-password", new { token = resetToken, newPassword = "abcdef" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await browser.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task LegacyTokensWorkOnlyForASingleAdoptAndNeverAfterLogoutAll()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var auth = await Register(app.CreateClient());
        var legacy = Legacy(auth.User.Id, app.Clock.Now);
        var old = app.CreateClient(); old.DefaultRequestHeaders.Authorization = new("Bearer", legacy);
        Assert.Equal(HttpStatusCode.Unauthorized, (await old.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await old.GetAsync("/api/tasks")).StatusCode);
        var browser = Browser(app); browser.DefaultRequestHeaders.Authorization = new("Bearer", legacy);
        var adopted = await browser.PostAsync("/api/auth/session/adopt", null);
        Assert.Equal(HttpStatusCode.OK, adopted.StatusCode);
        Assert.Equal(auth.User.Id, (await adopted.Content.ReadFromJsonAsync<UserSummary>())!.Id);
        browser.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.OK, (await browser.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Browser(app).SendAsync(WithBearer(legacy))).StatusCode);
        // Oturuma bağlı token eski token sayılmaz
        var sessionClient = app.CreateClient();
        Assert.Equal(HttpStatusCode.BadRequest, (await sessionClient.SendAsync(WithBearer(auth.AccessToken))).StatusCode);
        // Tüm cihazlardan çıkış daha önce üretilmiş, henüz taşınmamış kopyayı da kapatır.
        var older = Legacy(auth.User.Id, app.Clock.Now.AddSeconds(-5));
        var browser2 = Browser(app); await browser2.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "123456" });
        Assert.Equal(HttpStatusCode.NoContent, (await browser2.SendAsync(Unsafe("/api/auth/logout-all"))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Browser(app).SendAsync(WithBearer(older))).StatusCode);
    }

    [Fact]
    public async Task ASessionCannotBeUsedForAnotherOwner()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var a = await Register(app.CreateClient()); var b = await Register(app.CreateClient());
        var sidOfA = new JwtSecurityTokenHandler().ReadJwtToken(a.AccessToken).Claims.Single(x => x.Type == "sid").Value;
        var forged = Token([new Claim("sub", b.User.Id.ToString()), new Claim("sid", sidOfA), Iat(app.Clock.Now)]);
        var client = app.CreateClient(); client.DefaultRequestHeaders.Authorization = new("Bearer", forged);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        var unknown = Token([new Claim("sub", b.User.Id.ToString()), new Claim("sid", Guid.NewGuid().ToString()), Iat(app.Clock.Now)]);
        client.DefaultRequestHeaders.Authorization = new("Bearer", unknown);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task MeSlidesTheCookieAfterADayAndTouchesLastSeenHourly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var browser = Browser(app); var auth = await Register(browser);
        var fresh = await browser.GetAsync("/api/auth/me");
        Assert.False(fresh.Headers.Contains("Set-Cookie"));
        var created = (await Session(auth))!.LastSeenAt;
        app.Clock.Now = app.Clock.Now.AddMinutes(30);
        await browser.GetAsync("/api/auth/me");
        Assert.Equal(created, (await Session(auth))!.LastSeenAt);
        app.Clock.Now = app.Clock.Now.AddDays(2);
        var slid = await browser.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, slid.StatusCode);
        var cookie = slid.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("adhd_session=", cookie); Assert.Contains("max-age=34560000", cookie, StringComparison.OrdinalIgnoreCase);
        var renewed = cookie["adhd_session=".Length..cookie.IndexOf(';')];
        Assert.NotEqual(auth.AccessToken, renewed);
        Assert.Equal(new JwtSecurityTokenHandler().ReadJwtToken(auth.AccessToken).Claims.Single(x => x.Type == "sid").Value,
            new JwtSecurityTokenHandler().ReadJwtToken(renewed).Claims.Single(x => x.Type == "sid").Value);
        Assert.True((await Session(auth))!.LastSeenAt > created);
    }

    private static HttpRequestMessage WithBearer(string token)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/session/adopt");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }
    private static Claim Iat(DateTimeOffset at) => new("iat", at.ToUnixTimeSeconds().ToString(System.Globalization.CultureInfo.InvariantCulture), ClaimValueTypes.Integer64);
    private static string Legacy(Guid userId, DateTimeOffset at) => Token([new Claim("sub", userId.ToString()), Iat(at)]);
    private static string Token(Claim[] claims) => new JwtSecurityTokenHandler { SetDefaultTimesOnTokenCreation = false }.WriteToken(new JwtSecurityToken("adhd-api", "adhd-web", claims,
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(PlannerFactory.SigningKey)), SecurityAlgorithms.HmacSha256)));
    private async Task<AuthSession?> Session(AuthResponse auth)
    {
        var sid = Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(auth.AccessToken).Claims.Single(x => x.Type == "sid").Value);
        await using var db = fixture.CreateContext();
        return await db.AuthSessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == sid);
    }
    private async Task<int> Sessions(Guid userId) { await using var db = fixture.CreateContext(); return await db.AuthSessions.CountAsync(x => x.UserId == userId); }
    private async Task<int> TasksTitled(string title) { await using var db = fixture.CreateContext(); return await db.Tasks.CountAsync(x => x.Title == title); }

    private sealed class Env(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "Adhd.Api";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
