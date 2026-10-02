using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Adhd.IntegrationTests;

public sealed class DatabaseFixture : IAsyncLifetime
{
    private readonly string adminConnection = Environment.GetEnvironmentVariable("ADHD_TEST_POSTGRES")
        ?? "Host=127.0.0.1;Port=55432;Database=postgres;Username=postgres;Timeout=3";
    public string DatabaseName { get; } = "adhd_test_" + Guid.NewGuid().ToString("N");
    public string ConnectionString => new NpgsqlConnectionStringBuilder(adminConnection) { Database = DatabaseName }.ConnectionString;
    public PlannerDbContext CreateContext(bool captureOutbox = false) => new(new DbContextOptionsBuilder<PlannerDbContext>().UseNpgsql(ConnectionString).Options) { SuppressOutboxCapture = !captureOutbox };
    public async Task InitializeAsync()
    {
        await using var connection = new NpgsqlConnection(adminConnection);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{DatabaseName}\"", connection);
        await command.ExecuteNonQueryAsync();
        await using var db = CreateContext();
        await db.Database.MigrateAsync();
    }
    public async Task DisposeAsync()
    {
        if (!DatabaseName.StartsWith("adhd_test_", StringComparison.Ordinal) || DatabaseName.Length != 42)
            throw new InvalidOperationException("Refusing cleanup outside this fixture database.");
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(adminConnection);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE \"{DatabaseName}\" WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }
}
