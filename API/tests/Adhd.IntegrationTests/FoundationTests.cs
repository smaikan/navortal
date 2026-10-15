using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Net.Http.Json;
using Adhd.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class FoundationTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    [Fact]
    public async Task MigratedDatabaseIsReadyAndLivenessIsIndependent()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/openapi/v1.json")).StatusCode);
    }
    [Fact]
    public async Task UnavailableDatabaseDoesNotMakeLivenessFail()
    {
        await using var app = new PlannerFactory("Host=127.0.0.1;Port=1;Database=missing;Username=postgres;Timeout=1");
        var client = app.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/health/ready")).StatusCode);
    }
    [Fact]
    public async Task SchemaIsMigratedAndARealTransactionRollsBack()
    {
        await using var db = fixture.CreateContext();
        Assert.Contains(await db.Database.GetAppliedMigrationsAsync(), x => x.EndsWith("_InitialSchema", StringComparison.Ordinal));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.Equal("1", (await db.Metadata.SingleAsync(x => x.Key == "schema")).Value);
        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            db.Metadata.Add(new DatabaseMetadata { Key = "transaction-probe", Value = "temporary" });
            await db.SaveChangesAsync();
            await transaction.RollbackAsync();
        }
        db.ChangeTracker.Clear();
        Assert.False(await db.Metadata.AnyAsync(x => x.Key == "transaction-probe"));
        await using var connection = new NpgsqlConnection(fixture.ConnectionString);
        await connection.OpenAsync();
        await using var version = new NpgsqlCommand("SHOW server_version_num", connection);
        Assert.True(int.Parse((string)(await version.ExecuteScalarAsync())!) >= 180000);
    }
    [Fact]
    public async Task ValidationAndUnhandledErrorsAreSafeProblems()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var client = app.CreateClient();
        var invalid = await client.PostAsJsonAsync("/test-probe", new { name = "" });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        var validation = await invalid.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.NotEmpty(validation!.Errors);
        Assert.True(validation.Extensions.ContainsKey("traceId"));
        var error = await client.GetAsync("/test-probe/throw");
        Assert.Equal(HttpStatusCode.InternalServerError, error.StatusCode);
        Assert.Equal("application/problem+json", error.Content.Headers.ContentType!.MediaType);
        Assert.DoesNotContain("private-exception-secret", await error.Content.ReadAsStringAsync());
        var problem = await error.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal("internal_error", problem!.Extensions["code"]!.ToString());
    }
}

// Test rotasını yalnız test ApplicationPart'ı ekler. Normal API'de yayınlanmaz
[ApiController, Route("test-probe")]
public sealed class ProbeController : ControllerBase
{
    [HttpPost] public IActionResult Validate(ProbeRequest request) => Ok(request);
    [HttpGet("throw")] public IActionResult Throw() => throw new InvalidOperationException("private-exception-secret");
}
public sealed class ProbeRequest
{
    [Required] public string Name { get; set; } = "";
}
