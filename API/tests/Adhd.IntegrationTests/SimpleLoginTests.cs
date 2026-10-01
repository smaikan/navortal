using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Adhd.Application.Auth;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class SimpleLoginTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Theory]
    [InlineData("123456")]
    [InlineData("abcdef")]
    [InlineData("şifreş")]
    [InlineData("      ")]
    public async Task SixCharactersAreSufficientWithoutEmailConfirmation(string password)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var email = $"{Guid.NewGuid():N}@example.test";
        var registered = await client.PostAsJsonAsync("/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.Created, registered.StatusCode);
        var auth = (await registered.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/login", new { email, password })).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("12345")]
    public async Task FewerThanSixCharactersDoNotCreateAnAccount(string password)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var email = $"{Guid.NewGuid():N}@example.test";
        Assert.Equal(HttpStatusCode.BadRequest, (await app.CreateClient().PostAsJsonAsync("/api/auth/register", new { email, password })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.False(await db.Users.AnyAsync(x => x.Email == email));
    }

    [Fact]
    public async Task DisabledGoogleDoesNotCreateOrLinkAccounts()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/google", new { idToken = "not-a-google-proof" });
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Contains("google_disabled", await response.Content.ReadAsStringAsync());
        var register = await client.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" });
        var auth = (await register.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.PostAsJsonAsync("/api/auth/google/link", new { idToken = "not-a-google-proof" })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.False(await db.ExternalLogins.AnyAsync(x => x.UserId == auth.User.Id));
    }
}
