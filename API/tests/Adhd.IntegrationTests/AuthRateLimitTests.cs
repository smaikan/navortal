using System.Net;
using System.Net.Http.Json;
using Adhd.Api.Auth;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Adhd.IntegrationTests;

// Giriş sınırını ayardan oku. Production varsayılanı beş dakikada 30.
public sealed class AuthRateLimitTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task DefaultLimitIsThirtyPerFiveMinutes()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var settings = app.Services.GetRequiredService<IOptions<AuthRegistration.AuthRateLimitSettings>>().Value;
        Assert.Equal(30, settings.PermitLimit);
        Assert.Equal(300, settings.WindowSeconds);
        var client = app.CreateClient();
        for (var i = 0; i < 30; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(client)).StatusCode);
    }

    [Fact]
    public async Task ConfiguredLimitIsEnforcedExactly()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString, s => s.PostConfigure<AuthRegistration.AuthRateLimitSettings>(o => o.PermitLimit = 3));
        var client = app.CreateClient();
        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await Login(client)).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Login(client)).StatusCode);
    }

    [Fact]
    public void OutOfRangeLimitFailsStartup()
    {
        var app = new PlannerFactory(fixture.ConnectionString, s => s.PostConfigure<AuthRegistration.AuthRateLimitSettings>(o => o.PermitLimit = 0));
        Assert.ThrowsAny<OptionsValidationException>(() => app.CreateClient());
        app.Dispose();
    }

    private static Task<HttpResponseMessage> Login(HttpClient client) =>
        client.PostAsJsonAsync("/api/auth/login", new { email = $"{Guid.NewGuid():N}@example.test", password = "yanlis-parola" });
}
