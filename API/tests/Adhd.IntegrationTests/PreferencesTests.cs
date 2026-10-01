using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Adhd.Application.Auth;
using Adhd.Application.Preferences;
using Adhd.Domain.Preferences;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

public sealed class PreferencesTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static async Task<(HttpClient Client, Guid UserId)> User(PlannerFactory app)
    {
        var client = app.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = $"{Guid.NewGuid():N}@example.test", password = "123456" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>())!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.Id);
    }
    [Fact]
    public async Task DefaultsAreEmptyAndMultiIntervalCalendarRoundTripsWithDateOverrides()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        var initial = (await client.GetFromJsonAsync<PreferencesSnapshot>("/api/preferences"))!;
        Assert.Equal(0, initial.Version); Assert.Empty(initial.Values.Weekly);
        Assert.Equal(900, initial.Values.MinimumSplitSeconds); Assert.Equal(0, initial.Values.TransitionSeconds);
        Assert.Equal("Preview", initial.Values.PlanningMode);
        var date = new DateOnly(2026, 10, 19);
        var values = initial.Values with
        {
            PlanningMode = "Auto", MinimumSplitSeconds = 1200, TransitionSeconds = 300,
            Weekly = [new(1, 540, 720), new(1, 780, 1020), new(2, 600, 900)],
            Exceptions = [new(date, [new(660, 720)]), new(date.AddDays(1), [])]
        };
        var write = await client.PutAsJsonAsync("/api/preferences", new { version = 0, values });
        Assert.Equal(HttpStatusCode.OK, write.StatusCode);
        var saved = (await client.GetFromJsonAsync<PreferencesSnapshot>("/api/preferences"))!;
        Assert.Equal(1, saved.Version); Assert.Equal(3, saved.Values.Weekly.Length); Assert.Equal(2, saved.Values.Exceptions.Length);
        Assert.Equal("Auto", saved.Values.PlanningMode);
        var day = (await client.GetFromJsonAsync<WorkingDay>("/api/preferences/working-hours?date=2026-10-19"))!;
        Assert.Equal([new MinuteRange(660, 720)], day.LocalIntervals);
        Assert.Equal(TimeSpan.FromHours(1), Assert.Single(day.UtcIntervals).EndsAt - day.UtcIntervals[0].StartsAt);
        Assert.Empty((await client.GetFromJsonAsync<WorkingDay>("/api/preferences/working-hours?date=2026-10-20"))!.UtcIntervals);
        await using var db = fixture.CreateContext();
        Assert.Equal(1, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task JwtOwnershipIgnoresBodyUserIdAndStaleUpdatesCannotOverwrite()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString);
        var (a, aId) = await User(app); var (b, bId) = await User(app);
        var values = new PlanningPreferences { TimeZoneId = "UTC" };
        Assert.Equal(HttpStatusCode.OK, (await a.PutAsJsonAsync("/api/preferences", new { version = 0, values, userId = bId })).StatusCode);
        Assert.Equal("Europe/Istanbul", (await b.GetFromJsonAsync<PreferencesSnapshot>("/api/preferences"))!.Values.TimeZoneId);
        var stale = await a.PutAsJsonAsync("/api/preferences", new { version = 0, values = values with { TimeZoneId = "Europe/Berlin" } });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("version_conflict", await stale.Content.ReadAsStringAsync());
        await using var db = fixture.CreateContext();
        Assert.False(await db.Preferences.AnyAsync(x => x.UserId == bId));
        Assert.Equal(1, (await db.PlanningStates.SingleAsync(x => x.UserId == aId)).PlanningVersion);
        Assert.Equal(HttpStatusCode.NotFound, (await a.GetAsync($"/api/preferences/{bId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().GetAsync("/api/preferences")).StatusCode);
    }
    [Fact]
    public async Task ConcurrentFirstUpdatesHaveOneWinnerAndOneVersionIncrement()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        var results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => client.PutAsJsonAsync("/api/preferences", new { version = 0, values = new PlanningPreferences() })));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Equal(3, results.Count(x => x.StatusCode == HttpStatusCode.Conflict));
        await using var db = fixture.CreateContext();
        Assert.Equal(1, (await db.Preferences.SingleAsync(x => x.UserId == userId)).Version);
        Assert.Equal(1, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
    [Fact]
    public async Task InvalidSettingsNeverPersistOrAdvancePlanningVersion()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var (client, userId) = await User(app);
        var cases = new PlanningPreferences[]
        {
            new() { TimeZoneId = "No/SuchZone" }, new() { TimeZoneId = "Turkey Standard Time" },
            new() { MinimumSplitSeconds = 0 }, new() { TransitionSeconds = -1 }, new() { PlanningMode = "Silent" },
            new() { Weekly = [new(1, 540, 700), new(1, 600, 800)] }, new() { Weekly = [new(1, 1400, 40)] },
            new() { Exceptions = [new(new(2026, 10, 19), []), new(new(2026, 10, 19), [])] }
        };
        foreach (var values in cases)
            Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/preferences", new { version = 0, values })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/preferences/working-hours")).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.False(await db.Preferences.AnyAsync(x => x.UserId == userId));
        Assert.Equal(0, (await db.PlanningStates.SingleAsync(x => x.UserId == userId)).PlanningVersion);
    }
}
