using Adhd.Application.Jobs;
using Adhd.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

internal sealed class JobScenario(DatabaseFixture database, PlannerFactory app, TaskScenario user) : IAsyncDisposable
{
    internal static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    internal DatabaseFixture Database => database;
    internal PlannerFactory App { get; private set; } = app;
    internal TaskScenario User { get; private set; } = user;
    internal static async Task<JobScenario> Create(Action<IServiceCollection>? configure = null)
    {
        var db = new DatabaseFixture(); await db.InitializeAsync(); var app = new PlannerFactory(db.ConnectionString, configure); app.Clock.Now = Morning;
        return new(db, app, await TaskScenario.User(app));
    }
    internal PlannerDbContext Context() => database.CreateContext();
    internal async Task Restart(DateTimeOffset now)
    {
        var header = User.Client.DefaultRequestHeaders.Authorization; var id = User.UserId; await App.DisposeAsync(); App = new(database.ConnectionString); App.Clock.Now = now;
        var client = App.CreateClient(); client.DefaultRequestHeaders.Authorization = header; User = new(client, id);
    }
    internal async Task<OutboxClaim[]> Claim(int limit = 100)
    {
        await using var scope = App.Services.CreateAsyncScope(); return await scope.ServiceProvider.GetRequiredService<IOutboxStore>().ClaimAsync(limit, default);
    }
    internal async Task<bool> Effect(OutboxClaim claim)
    {
        await using var scope = App.Services.CreateAsyncScope(); return await scope.ServiceProvider.GetRequiredService<IOutboxHandler>().HandleAsync(claim, default);
    }
    internal async Task Pump()
    {
        for (var i = 0; i < 20; i++)
        {
            await using var scope = App.Services.CreateAsyncScope(); if (await scope.ServiceProvider.GetRequiredService<IOutboxDispatcher>().RunOnceAsync(20, default) == 0) return;
        }
        throw new InvalidOperationException("Outbox fixture did not drain within its bound.");
    }
    internal async Task Reminders()
    {
        await using var scope = App.Services.CreateAsyncScope(); _ = await scope.ServiceProvider.GetRequiredService<IReminderDispatcher>().RunOnceAsync(100, default);
    }
    public async ValueTask DisposeAsync() { await App.DisposeAsync(); await database.DisposeAsync(); }
}
