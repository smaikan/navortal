using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Adhd.Application.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Adhd.IntegrationTests;

public sealed class AuthTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static string Email() => Guid.NewGuid().ToString("N") + "@example.test";
    private const string Password = "correct-horse-adhd";
    private static async Task<AuthResponse> Register(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email, password = Password, displayName = "Test Reader" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        // Kayıt HttpOnly cookie kurar. Tarayıcı dışı istemci için gövdede token durur
        Assert.Contains("httponly", Assert.Single(response.Headers.GetValues("Set-Cookie")), StringComparison.OrdinalIgnoreCase);
        return (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
    }

    [Fact]
    public async Task IssuedTokenHasNoExpirationAndRemainsValidTwentyYearsLater()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var email = Email();
        var auth = await Register(client, email);
        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(auth.AccessToken);
        Assert.False(parsed.Payload.ContainsKey("exp"));
        Assert.False(parsed.Payload.ContainsKey("nbf"));
        Assert.Equal(auth.User.Id.ToString(), parsed.Subject);
        Assert.True(parsed.Payload.ContainsKey("iat"));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        app.Clock.Now = app.Clock.Now.AddYears(20);
        var me = await client.GetFromJsonAsync<UserSummary>("/api/auth/me");
        Assert.Equal(auth.User, me);
        await using var db = fixture.CreateContext();
        var user = await db.Users.SingleAsync(x => x.Id == auth.User.Id);
        Assert.NotEqual(Password, user.PasswordHash);
        Assert.True(await db.PlanningStates.AnyAsync(x => x.UserId == user.Id));
    }

    [Fact]
    public async Task LoginNormalizesEmailAndNeverReturnsARefreshOrExpiryField()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var email = Email();
        var registered = await Register(client, email);
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email = email.ToUpperInvariant(), password = Password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("Bearer", json.RootElement.GetProperty("tokenType").GetString());
        Assert.False(json.RootElement.TryGetProperty("refreshToken", out _));
        Assert.False(json.RootElement.TryGetProperty("expiresIn", out _));
        Assert.Equal(registered.User.Id, json.RootElement.GetProperty("user").GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong-password" })).StatusCode);
    }

    [Fact]
    public async Task AnonymousAndInvalidInputAreRejectedWithoutHtmlRedirects()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var anonymous = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal("application/problem+json", anonymous.Content.Headers.ContentType!.MediaType);
        Assert.Null(anonymous.Headers.Location);
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync("/api/auth/register", new { email = "bad", password = "short" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/api/auth/refresh", new { })).StatusCode);
    }

    [Theory]
    [InlineData("signature")]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("unsigned")]
    [InlineData("algorithm")]
    [InlineData("missing-user")]
    [InlineData("expired")]
    [InlineData("future-nbf")]
    public async Task InvalidTokensAreRejectedByTheRealMiddleware(string fault)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var auth = await Register(client, Email());
        var key = fault == "signature" ? new string('x', 40) : PlannerFactory.SigningKey;
        var token = new JwtSecurityToken(
            issuer: fault == "issuer" ? "other-api" : "adhd-api",
            audience: fault == "audience" ? "other-web" : "adhd-web",
            claims: [new Claim("sub", fault == "missing-user" ? Guid.NewGuid().ToString() : auth.User.Id.ToString())],
            notBefore: fault == "future-nbf" ? app.Clock.Now.AddDays(1).UtcDateTime : null,
            expires: fault == "expired" ? app.Clock.Now.AddDays(-1).UtcDateTime : fault == "future-nbf" ? app.Clock.Now.AddDays(2).UtcDateTime : null,
            signingCredentials: fault == "unsigned" ? null : new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), fault == "algorithm" ? SecurityAlgorithms.HmacSha512 : SecurityAlgorithms.HmacSha256));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        if (fault == "future-nbf")
        {
            Assert.True(token.Payload.ContainsKey("nbf"));
            Assert.True(token.ValidFrom > app.Clock.Now.UtcDateTime);
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task LogoutRevokesTheSessionIncludingACopyOfTheToken()
    {
        // Çıkış artık sunucudaki oturumu da kapatıyor
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var auth = await Register(client, Email());
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task ParallelDuplicateRegistrationCreatesExactlyOneUserAndPlanningState()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var email = Email();
        var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            client.PostAsJsonAsync("/api/auth/register", new { email, password = Password })));
        Assert.Single(responses, x => x.StatusCode == HttpStatusCode.Created);
        Assert.Equal(3, responses.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        await using var db = fixture.CreateContext();
        var user = Assert.Single(await db.Users.Where(x => x.NormalizedEmail == email.ToUpperInvariant()).ToListAsync());
        Assert.Equal(1, await db.PlanningStates.CountAsync(x => x.UserId == user.Id));
    }

    [Fact]
    public async Task UserIdCannotBeOverriddenAndOpenApiDeclaresBearer()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var forgedId = Guid.NewGuid();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = Email(), password = Password, userId = forgedId });
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        Assert.NotEqual(forgedId, auth.User.Id);
        var schema = await client.GetFromJsonAsync<JsonElement>("/openapi/v1.json");
        Assert.Equal("bearer", schema.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer").GetProperty("scheme").GetString());
    }
}
