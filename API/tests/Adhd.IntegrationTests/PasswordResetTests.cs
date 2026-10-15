using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Adhd.Application.Auth;
using Adhd.Domain.Users;
using Adhd.Infrastructure.Auth;
using MailKit.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

public sealed class PasswordResetTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private PlannerFactory Factory(SmtpTestServer smtp, string resetPageUrl = "https://planner.example.test/reset-password") => new(fixture.ConnectionString, services =>
        services.PostConfigure<SmtpSettings>(s =>
        {
            s.Enabled = true; s.Host = "127.0.0.1"; s.Port = smtp.Port; s.Security = SecureSocketOptions.None;
            s.From = "planner@example.test"; s.ResetPageUrl = resetPageUrl;
        }));
    private static async Task<AuthResponse> Register(HttpClient client, string email)
    {
        var result = await client.PostAsJsonAsync("/api/auth/register", new { email, password = "123456" });
        Assert.Equal(HttpStatusCode.Created, result.StatusCode);
        return (await result.Content.ReadFromJsonAsync<AuthResponse>())!;
    }
    private static async Task<string> RequestToken(HttpClient client, SmtpTestServer smtp, string email)
    {
        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var mail = await smtp.ReceiveAsync();
        Assert.Equal(email, mail.To.Mailboxes.Single().Address);
        var link = Regex.Match(mail.TextBody ?? "", @"https://planner\.example\.test/reset-password\?token=([A-F0-9]{64})");
        Assert.True(link.Success, "SMTP message must carry the configured reset link.");
        return link.Groups[1].Value;
    }
    [Fact]
    public async Task CurrentFrontendFragmentUrlWorksThroughRealSmtpWithoutQueryToken()
    {
        await using var smtp = new SmtpTestServer();
        await using var app = Factory(smtp, "https://planner.example.test/parola-yenile#");
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        await Register(client, email);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/forgot-password", new { email })).StatusCode);
        var mail = await smtp.ReceiveAsync();
        var match = Regex.Match(mail.TextBody ?? "", @"https://planner\.example\.test/parola-yenile#\?token=([A-F0-9]{64})");
        Assert.True(match.Success, "SMTP message must carry the frontend fragment link.");
        var link = new Uri(match.Value);
        Assert.True(link.Query.Length == 0 && link.Fragment.StartsWith("#?token=", StringComparison.Ordinal));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token = match.Groups[1].Value, newPassword = "abcdef" })).StatusCode);
    }
    [Fact]
    public async Task RealSmtpLinkResetsPasswordOnceAndEndsExistingSessions()
    {
        await using var smtp = new SmtpTestServer();
        await using var app = Factory(smtp);
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        var auth = await Register(client, email);
        var token = await RequestToken(client, smtp, email);
        await using (var db = fixture.CreateContext())
        {
            var reset = await db.PasswordResets.SingleAsync(x => x.UserId == auth.User.Id);
            Assert.Equal(PasswordResetService.Hash(token), reset.TokenHash);
            Assert.NotEqual(token, reset.TokenHash);
            Assert.Equal(TimeSpan.FromMinutes(30), reset.ExpiresAt - reset.CreatedAt);
        }
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token, newPassword = "12345" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token, newPassword = "abcdef" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token, newPassword = "654321" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "123456" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "abcdef" })).StatusCode);
        // Yeni parola bu eski token kopyası dahil önceki oturumları kapatır
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        await using var check = fixture.CreateContext();
        Assert.NotNull((await check.PasswordResets.SingleAsync(x => x.UserId == auth.User.Id)).UsedAt);
    }
    [Fact]
    public async Task ThirtyMinuteBoundaryAndInvalidCodeAreRejected()
    {
        await using var smtp = new SmtpTestServer(); await using var app = Factory(smtp);
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        await Register(client, email);
        var token = await RequestToken(client, smtp, email);
        app.Clock.Now = app.Clock.Now.AddMinutes(30);
        foreach (var value in new[] { token, new string('0', 64) })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/reset-password", new { token = value, newPassword = "abcdef" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "123456" })).StatusCode);
    }
    [Fact]
    public async Task ParallelConsumptionOfDifferentLinksForSameAccountHasOneWinner()
    {
        await using var smtp = new SmtpTestServer(); await using var app = Factory(smtp);
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        var user = await Register(client, email);
        var one = await RequestToken(client, smtp, email); var two = await RequestToken(client, smtp, email);
        var results = await Task.WhenAll(new[] { one, one, two, two }.Select(token =>
            client.PostAsJsonAsync("/api/auth/reset-password", new { token, newPassword = "abcdef" })));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.NoContent);
        Assert.Equal(3, results.Count(x => x.StatusCode == HttpStatusCode.BadRequest));
        await using var db = fixture.CreateContext();
        Assert.Equal(2, await db.PasswordResets.CountAsync(x => x.UserId == user.User.Id && x.UsedAt != null));
    }
    [Fact]
    public async Task UnknownAndGoogleOnlyAccountsReturnSameResponseWithoutMailOrPasswordCreation()
    {
        await using var smtp = new SmtpTestServer(); await using var app = Factory(smtp);
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        var user = new AppUser { Id = Guid.CreateVersion7(), Email = email, NormalizedEmail = email.ToUpperInvariant(), DisplayName = email, CreatedAt = app.Clock.Now };
        await using (var db = fixture.CreateContext()) { db.Users.Add(user); await db.SaveChangesAsync(); }
        var known = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        var unknown = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email = "unknown@example.test" });
        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode); Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal(await known.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
        Assert.False(smtp.HasMessage);
        await using var check = fixture.CreateContext();
        Assert.False(await check.PasswordResets.AnyAsync(x => x.UserId == user.Id));
        Assert.Null((await check.Users.SingleAsync(x => x.Id == user.Id)).PasswordHash);
    }
    [Fact]
    public async Task DisabledMailDoesNotExposeTokenOrCreateUndeliverableReset()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var client = app.CreateClient();
        var email = $"{Guid.NewGuid():N}@example.test"; var auth = await Register(client, email);
        var response = await client.PostAsJsonAsync("/api/auth/forgot-password", new { email });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.DoesNotContain("token", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);
        await using var db = fixture.CreateContext();
        Assert.False(await db.PasswordResets.AnyAsync(x => x.UserId == auth.User.Id));
    }
    [Fact]
    public async Task SmtpFailureKeepsGenericResponseAndRemovesUndeliveredCode()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString, services => services.PostConfigure<SmtpSettings>(s =>
        { s.Enabled = true; s.Host = "127.0.0.1"; s.Port = 1; s.From = "planner@example.test"; s.ResetPageUrl = "https://planner.example.test/parola-yenile#"; }));
        var client = app.CreateClient(); var email = $"{Guid.NewGuid():N}@example.test";
        var auth = await Register(client, email);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/forgot-password", new { email })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.False(await db.PasswordResets.AnyAsync(x => x.UserId == auth.User.Id));
    }
}
