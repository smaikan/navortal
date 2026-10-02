using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

public sealed class ReverseProxyTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task OnlyConfiguredProxyCanSupplyClientAddressAndHttpsScheme(bool trusted)
    {
        var remote = IPAddress.Parse("192.0.2.9"); await using var app = new PlannerFactory(fixture.ConnectionString, services =>
        {
            services.AddSingleton<IStartupFilter>(new RemoteAddressFilter(remote));
            if (trusted) services.PostConfigure<ForwardedHeadersOptions>(o => o.KnownProxies.Add(remote));
        });
        var client = app.CreateClient(); var request = new HttpRequestMessage(HttpMethod.Get, "/test-transport"); request.Headers.Add("X-Forwarded-For", "203.0.113.7"); request.Headers.Add("X-Forwarded-Proto", "https");
        var response = await client.SendAsync(request); var transport = (await response.Content.ReadFromJsonAsync<TransportView>())!; Assert.Equal(trusted ? "https" : "http", transport.Scheme); Assert.Equal(trusted ? "203.0.113.7" : "192.0.2.9", transport.Address);
    }
    private sealed class RemoteAddressFilter(IPAddress remote) : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app => { app.Use((context, continuation) => { context.Connection.RemoteIpAddress = remote; return continuation(); }); next(app); };
    }
}
[ApiController, Route("test-transport")]
public sealed class TransportProbeController : ControllerBase
{
    [HttpGet] public TransportView Get() => new(Request.Scheme, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "");
}
public sealed record TransportView(string Scheme, string Address);
