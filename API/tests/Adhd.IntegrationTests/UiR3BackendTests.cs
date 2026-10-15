using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Analytics;
using Adhd.Application.ClientErrors;
using Adhd.Application.Planning;
using Adhd.Application.SpecialDays;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Jobs;
using Adhd.Domain.SpecialDays;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Jobs;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Adhd.IntegrationTests;

// Tahmin doğruluğu, gün özeti, istemci hatası, toplu görev ve özel günleri gerçek PostgreSQL ile dene.
public sealed class UiR3BackendTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = new(2026, 10, 15);
    private static async Task<string> Code(HttpResponseMessage response) => (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString()!;
    private static async Task Manual(TaskScenario s, Guid id, DateTimeOffset start, DateTimeOffset end)
    {
        var response = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/work-sessions/manual", new { taskId = id, startedAt = start, endedAt = end, reason = "UI-R3" });
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }
    private static async Task<Guid> Finished(TaskScenario s, string title, long? estimate, int actualMinutes, int offsetMinutes)
    {
        var task = await s.Root(title); await s.Define(task.Id, true, estimate);
        if (actualMinutes > 0) await Manual(s, task.Id, Morning.AddMinutes(offsetMinutes), Morning.AddMinutes(offsetMinutes + actualMinutes));
        await s.State(task.Id, TaskAction.Complete); return task.Id;
    }

    [Fact]
    public async Task EstimateAccuracyNeedsFiveSamplesAndExcludesUnknownZeroAndWorklessTasks()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning.AddHours(12); var s = await TaskScenario.User(app);
        async Task<EstimateAccuracyView> Read(TaskScenario u) => await TaskScenario.Read<EstimateAccuracyView>(await u.Client.GetAsync("/api/analytics/estimate-accuracy?fromDate=2026-10-15&toDate=2026-10-15"));
        var minutes = new[] { 10, 15, 20, 5 };
        for (var i = 0; i < minutes.Length; i++) await Finished(s, $"İş {i}", 600, minutes[i], i * 30);
        await Finished(s, "Tahminsiz", null, 10, 200); await Finished(s, "Çalışmasız", 600, 0, 0);
        var four = await Read(s);
        Assert.Equal((4, "insufficient_samples", (decimal?)null, 5), (four.SampleCount, four.UnavailableReason, four.MedianRatio, four.MinimumSamples));
        Assert.Equal(1, four.ExcludedWithoutWorkCount);
        await Finished(s, "Beşinci", 600, 30, 300);
        var five = await Read(s);
        Assert.Equal(5, five.SampleCount); Assert.Null(five.UnavailableReason);
        // Oranlar 1, 1,5, 2, 0,5 ve 3. Ortanca 1,5, p25 1, p75 2
        Assert.Equal((1.5m, 1m, 2m), (five.MedianRatio!.Value, five.P25Ratio!.Value, five.P75Ratio!.Value));
        var stranger = await TaskScenario.User(app);
        Assert.Equal(0, (await Read(stranger)).SampleCount);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/analytics/estimate-accuracy?fromDate=2026-10-15&toDate=2027-10-20")).StatusCode);
    }

    [Fact]
    public async Task GlanceComputesRemainingTimeUnknownEstimatesCapacityAndHintsInOneRead()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        await SchedulingHttpTests.Configure(s, end: 600); // Yerel saat 09:00–10:00. UTC karşılığı 06:00–07:00.
        var timed = await s.Root("Saatli"); await s.Define(timed.Id, true, 1800);
        await ManualPlanningTests.Create(s, timed.Id, Morning.AddMinutes(10), Morning.AddMinutes(40));
        var known = await s.Root("Bilinen"); await s.Define(known.Id, true, 1200);
        var unknown = await s.Root("Bilinmeyen"); await s.Define(unknown.Id, true, null);
        foreach (var id in new[] { known.Id, unknown.Id }) Assert.Equal(HttpStatusCode.Created, (await s.Client.PostAsJsonAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/items", new { taskId = id })).StatusCode);
        var note = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/notes", new { kind = "NextStep", taskId = timed.Id, text = "Dünkü notu aç" });
        Assert.True(note.IsSuccessStatusCode, await note.Content.ReadAsStringAsync());
        app.Clock.Now = Morning.AddMinutes(20);
        await Manual(s, known.Id, Morning, Morning.AddMinutes(5));
        var glance = await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/glance"));
        Assert.Equal(40m * 60, glance.WorkingRemainingSeconds);
        Assert.Equal(20m * 60 + 1200, glance.PlannedRemainingSeconds);
        Assert.Equal((1, 0, 3), (glance.UnknownEstimateCount, glance.CompletedItemCount, glance.OpenItemCount));
        Assert.Equal(300m, glance.ActualSeconds);
        Assert.False(glance.OverCapacity);
        Assert.Equal("Dünkü notu aç", glance.Hints.Single(x => x.TaskId == timed.Id).NextStep!.Text);
        Assert.Null(glance.Hints.Single(x => x.TaskId == known.Id).NextStep);
        app.Clock.Now = Morning.AddMinutes(45);
        var late = await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/glance"));
        Assert.Equal(15m * 60, late.WorkingRemainingSeconds); Assert.Equal(1200m, late.PlannedRemainingSeconds); Assert.True(late.OverCapacity);
        var stranger = await TaskScenario.User(app);
        var empty = await TaskScenario.Read<DayGlanceView>(await stranger.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/glance"));
        Assert.Equal((0, 0, 0m), (empty.OpenItemCount, empty.UnknownEstimateCount, empty.PlannedRemainingSeconds)); Assert.Empty(empty.Hints);
    }

    [Fact]
    public async Task ClientErrorsAreMaskedLimitedOwnerScopedAndExpire()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var token = s.Client.DefaultRequestHeaders.Authorization!.Parameter!;
        object Body(string message) => new { message, kind = "Error", route = "/app/bugun", buildId = "build-1", browserFamily = "Chrome", occurredAt = Morning };
        Assert.Equal(HttpStatusCode.Unauthorized, (await app.CreateClient().PostAsJsonAsync("/api/client-errors", Body("x"))).StatusCode);
        var masked = await s.Client.PostAsJsonAsync("/api/client-errors", Body($"Boom {token} a@b.example.test Bearer abc.def 0123456789abcdef0123456789abcdef"));
        Assert.Equal(HttpStatusCode.Accepted, masked.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/client-errors", new { message = "x", kind = "Error", route = "https://evil.example/x?token=1", buildId = "b", browserFamily = "Chrome", occurredAt = Morning })).StatusCode);
        for (var i = 0; i < 9; i++) Assert.Equal(HttpStatusCode.Accepted, (await s.Client.PostAsJsonAsync("/api/client-errors", Body($"hata {i}"))).StatusCode);
        var limited = await s.Client.PostAsJsonAsync("/api/client-errors", Body("on birinci"));
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode); Assert.Equal("client_error_limited", await Code(limited));
        var other = await TaskScenario.User(app);
        Assert.Equal(HttpStatusCode.Accepted, (await other.Client.PostAsJsonAsync("/api/client-errors", Body("başka"))).StatusCode);
        await using (var db = fixture.CreateContext())
        {
            var stored = await db.ClientErrors.Where(x => x.UserId == s.UserId).ToArrayAsync();
            Assert.Equal(10, stored.Length);
            var first = stored.OrderBy(x => x.Id).First();
            Assert.DoesNotContain(token, first.Message); Assert.DoesNotContain("a@b.example.test", first.Message); Assert.DoesNotContain("abc.def", first.Message); Assert.DoesNotContain("0123456789abcdef", first.Message);
            Assert.Contains("[gizli]", first.Message); Assert.Contains("[e-posta]", first.Message);
        }
        app.Clock.Now = Morning.AddMinutes(2);
        Assert.Equal(HttpStatusCode.Accepted, (await s.Client.PostAsJsonAsync("/api/client-errors", Body("dakika sonra"))).StatusCode);
        app.Clock.Now = Morning.AddDays(31);
        await using (var scope = app.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<MaintenanceJob>().RunOnceAsync(Guid.Empty, default);
        await using (var db = fixture.CreateContext()) Assert.False(await db.ClientErrors.AnyAsync(x => x.UserId == s.UserId || x.UserId == other.UserId));
    }

    [Fact]
    public async Task BatchCaptureIsAtomicIdempotentAndOwnerChecked()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var pool = await TaskScenario.Read<JsonElement>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "Gelen kutusu" }));
        var poolId = pool.GetProperty("id").GetGuid();
        var body = new { titles = new[] { "Fatura öde", " Annemi ara ", "Fatura öde" }, poolId };
        var key = Guid.NewGuid().ToString();
        var first = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/batch", body, key);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var result = await TaskScenario.Read<TaskBatchResult>(first);
        Assert.Equal(new[] { "Fatura öde", "Annemi ara", "Fatura öde" }, result.Items.Select(x => x.Title));
        Assert.All(result.Items, x => Assert.Equal(poolId, x.PoolId));
        var replay = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/batch", body, key);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode); Assert.True(replay.Headers.Contains("Idempotent-Replay"));
        Assert.Equal(result.Items.Select(x => x.Id), (await TaskScenario.Read<TaskBatchResult>(replay)).Items.Select(x => x.Id));
        var conflict = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/batch", new { titles = new[] { "Başka" } }, key);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        // Bir başlık geçersizse hiçbir görevi kaydetme.
        var invalid = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/batch", new { titles = new[] { "Geçerli", new string('x', 201) } }, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/batch", new { titles = Enumerable.Range(0, 51).Select(i => $"t{i}").ToArray() }, Guid.NewGuid().ToString())).StatusCode);
        var stranger = await TaskScenario.User(app);
        var foreignPool = await ManualPlanningTests.Send(stranger, HttpMethod.Post, "/api/tasks/batch", new { titles = new[] { "Sızma" }, poolId }, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.NotFound, foreignPool.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/tasks/batch", new { titles = new[] { "Anahtarsız" } })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(3, await db.Tasks.CountAsync(x => x.UserId == s.UserId));
        Assert.False(await db.Tasks.AnyAsync(x => x.UserId == stranger.UserId));
        Assert.Equal(3, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId && x.Type == "Created"));
    }

    private static object Day(string title, string kind, int month, int day, int? year = null, string recurrence = "Yearly", bool nonWorking = false, string reminder = "None") =>
        new { title, kind, month, day, year, recurrence, nonWorking, reminder };

    [Fact]
    public async Task SpecialDaysValidateVersionAndIdempotencyAndComputeYearlyAndOneOffOccurrences()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var key = Guid.NewGuid().ToString();
        var created = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Annem", "Birthday", 2, 29, 1960), key);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var leap = await TaskScenario.Read<SpecialDayView>(created);
        Assert.Equal(new DateOnly(2027, 2, 28), leap.NextOccurrence);
        Assert.Equal(leap.Id, (await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Annem", "Birthday", 2, 29, 1960), key))).Id);
        Assert.Equal(HttpStatusCode.Conflict, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Başka", "Other", 1, 1), key)).StatusCode);
        var once = await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Tatil", "Holiday", 12, 31, 2026, "Once"), Guid.NewGuid().ToString()));
        var newYear = await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Yılbaşı", "Holiday", 1, 1), Guid.NewGuid().ToString()));
        foreach (var bad in new[] { Day("", "Other", 1, 1), Day("x", "Other", 2, 30), Day("x", "Other", 13, 1), Day("x", "Other", 2, 29, 2027, "Once"), Day("x", "Other", 3, 3, null, "Once") })
            Assert.Equal(HttpStatusCode.BadRequest, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", bad, Guid.NewGuid().ToString())).StatusCode);
        // Aralık en çok 366 gün. Biri normal, biri artık yıl Şubat'ını kapsayan iki okuma yap
        var first = await TaskScenario.Read<SpecialDayOccurrencePage>(await s.Client.GetAsync("/api/special-days/occurrences?fromDate=2026-12-01&toDate=2027-11-30"));
        var second = await TaskScenario.Read<SpecialDayOccurrencePage>(await s.Client.GetAsync("/api/special-days/occurrences?fromDate=2027-12-01&toDate=2028-03-01"));
        Assert.Equal(new[] { new DateOnly(2026, 12, 31), new DateOnly(2027, 1, 1), new DateOnly(2027, 2, 28), new DateOnly(2028, 1, 1), new DateOnly(2028, 2, 29) }, first.Items.Concat(second.Items).Select(x => x.Date));
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/special-days/occurrences?fromDate=2026-01-01&toDate=2027-01-03")).StatusCode);
        var list = await TaskScenario.Read<SpecialDayPage>(await s.Client.GetAsync("/api/special-days"));
        Assert.Equal(new[] { once.Id, newYear.Id, leap.Id }, list.Items.Select(x => x.Id));
        var updated = await s.Client.PutAsJsonAsync($"/api/special-days/{newYear.Id}", new { version = newYear.Version, title = "Yeni yıl", kind = "Holiday", month = 1, day = 1, recurrence = "Yearly", nonWorking = true, reminder = "None" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var stale = await s.Client.PutAsJsonAsync($"/api/special-days/{newYear.Id}", new { version = newYear.Version, title = "Eski", kind = "Holiday", month = 1, day = 1, recurrence = "Yearly" });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode); Assert.Equal("version_conflict", await Code(stale));
        var deleted = await TaskScenario.Read<SpecialDayView>(await s.Client.PostAsJsonAsync($"/api/special-days/{once.Id}/delete", new { version = once.Version }));
        Assert.NotNull(deleted.DeletedAt);
        Assert.DoesNotContain((await TaskScenario.Read<SpecialDayOccurrencePage>(await s.Client.GetAsync("/api/special-days/occurrences?fromDate=2026-12-01&toDate=2026-12-31"))).Items, x => x.SpecialDayId == once.Id);
        var restored = await TaskScenario.Read<SpecialDayView>(await s.Client.PostAsJsonAsync($"/api/special-days/{once.Id}/restore", new { version = deleted.Version }));
        Assert.Null(restored.DeletedAt);
        var stranger = await TaskScenario.User(app);
        Assert.Empty((await TaskScenario.Read<SpecialDayPage>(await stranger.Client.GetAsync("/api/special-days"))).Items);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.Client.PostAsJsonAsync($"/api/special-days/{once.Id}/delete", new { version = restored.Version })).StatusCode);
        await using var db = fixture.CreateContext();
        Assert.True(await db.Outbox.AnyAsync(x => x.UserId == s.UserId && x.Kind == "SpecialDayChanged" && x.SourceId == once.Id));
    }

    [Fact]
    public async Task RemindersAreNineLocalAcrossDstAndBecomeObsoleteOnChangeOrDelete()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var prefs = await TaskScenario.Read<Adhd.Application.Preferences.PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { TimeZoneId = "Europe/Berlin" } })).StatusCode);
        var winter = await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Kış", "Other", 1, 10, reminder: "SameDay"), Guid.NewGuid().ToString()));
        var summer = await TaskScenario.Read<SpecialDayView>(await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Yaz", "Anniversary", 7, 10, reminder: "OneWeekBefore"), Guid.NewGuid().ToString()));
        await using (var db = fixture.CreateContext())
        {
            var w = await db.NotificationIntents.SingleAsync(x => x.UserId == s.UserId && x.SourceId == winter.Id);
            var su = await db.NotificationIntents.SingleAsync(x => x.UserId == s.UserId && x.SourceId == summer.Id);
            Assert.Equal(new DateTimeOffset(2027, 1, 10, 8, 0, 0, TimeSpan.Zero), w.NotBefore); // CET saat farkı +1 saat.
            Assert.Equal(new DateTimeOffset(2027, 7, 3, 7, 0, 0, TimeSpan.Zero), su.NotBefore); // Bir hafta önce saat farkı CEST ile +2
            Assert.Equal(("SpecialDay", NotificationIntentState.Pending), (w.Kind, w.State));
        }
        var changed = await TaskScenario.Read<SpecialDayView>(await s.Client.PutAsJsonAsync($"/api/special-days/{winter.Id}", new { version = winter.Version, title = "Kış", kind = "Other", month = 1, day = 11, recurrence = "Yearly", reminder = "OneDayBefore" }));
        await s.Client.PostAsJsonAsync($"/api/special-days/{summer.Id}/delete", new { version = summer.Version });
        await using (var db = fixture.CreateContext())
        {
            var winterIntents = await db.NotificationIntents.Where(x => x.UserId == s.UserId && x.SourceId == winter.Id).ToArrayAsync();
            Assert.Equal(NotificationIntentState.Obsolete, winterIntents.Single(x => x.SourceVersion == winter.Version).State);
            Assert.Equal(new DateTimeOffset(2027, 1, 10, 8, 0, 0, TimeSpan.Zero), winterIntents.Single(x => x.SourceVersion == changed.Version).NotBefore);
            Assert.Equal(NotificationIntentState.Obsolete, (await db.NotificationIntents.SingleAsync(x => x.UserId == s.UserId && x.SourceId == summer.Id)).State);
        }
        // Bakım işi pencereyi doldurur. Mevcut görevi ikinci kez üretmez
        await using (var scope = app.Services.CreateAsyncScope()) await scope.ServiceProvider.GetRequiredService<MaintenanceJob>().RunOnceAsync(Guid.Empty, default);
        await using (var db = fixture.CreateContext()) Assert.Equal(1, await db.NotificationIntents.CountAsync(x => x.UserId == s.UserId && x.SourceId == winter.Id && x.State == NotificationIntentState.Pending));
    }

    [Fact]
    public async Task NonWorkingSpecialDayEmptiesCapacityUnlessADateOverrideExistsAndNeverMovesThePlan()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        await SchedulingHttpTests.Configure(s, end: 720);
        var task = await s.Root("Planlı"); await s.Define(task.Id, true, 1800);
        var block = (await ManualPlanningTests.Create(s, task.Id, Morning.AddHours(1), Morning.AddHours(2))).Schedules.Single();
        var before = await TaskScenario.Read<Adhd.Application.Preferences.WorkingDay>(await s.Client.GetAsync($"/api/preferences/working-hours?date={Today:yyyy-MM-dd}"));
        Assert.NotEmpty(before.UtcIntervals);
        await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/special-days", Day("Bayram", "Holiday", 10, 15, nonWorking: true), Guid.NewGuid().ToString());
        var empty = await TaskScenario.Read<Adhd.Application.Preferences.WorkingDay>(await s.Client.GetAsync($"/api/preferences/working-hours?date={Today:yyyy-MM-dd}"));
        Assert.Empty(empty.UtcIntervals);
        var glance = await TaskScenario.Read<DayGlanceView>(await s.Client.GetAsync($"/api/daily-plans/{Today:yyyy-MM-dd}/glance"));
        Assert.Equal(0m, glance.WorkingRemainingSeconds); Assert.True(glance.OverCapacity);
        var schedule = await TaskScenario.Read<Adhd.Application.Planning.ScheduleView>(await s.Client.GetAsync($"/api/schedules/{block.Id}"));
        Assert.Equal((block.StartsAt, block.EndsAt, block.Version), (schedule.StartsAt, schedule.EndsAt, schedule.Version));
        var prefs = await TaskScenario.Read<Adhd.Application.Preferences.PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { version = prefs.Version, values = prefs.Values with { Exceptions = [new(Today, [new(600, 660)])] } })).StatusCode);
        var overridden = await TaskScenario.Read<Adhd.Application.Preferences.WorkingDay>(await s.Client.GetAsync($"/api/preferences/working-hours?date={Today:yyyy-MM-dd}"));
        Assert.Single(overridden.UtcIntervals);
    }

    [Fact]
    public async Task UiSupportsDefaultForOlderDocumentsAndSaveWithVersionChecks()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        await using (var db = fixture.CreateContext())
        {
            db.Preferences.Add(new() { UserId = s.UserId, Version = 1, Payload = "{\"TimeZoneId\":\"Europe/Istanbul\",\"SupportEnabled\":true}" });
            await db.SaveChangesAsync();
        }
        var legacy = await TaskScenario.Read<Adhd.Application.Preferences.PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal(new Adhd.Domain.Preferences.UiSupports(), legacy.Values.UiSupports);
        Assert.Equal((false, true, true, true, true, false), (legacy.Values.UiSupports.CalmView, legacy.Values.UiSupports.DayBar, legacy.Values.UiSupports.CalibrationHints, legacy.Values.UiSupports.Nudges, legacy.Values.UiSupports.ResumeCard, legacy.Values.UiSupports.OpenTodayAsOneThing));
        var calm = legacy.Values with { UiSupports = new(CalmView: true, Nudges: false) };
        var saved = await s.Client.PutAsJsonAsync("/api/preferences", new { version = legacy.Version, values = calm });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var stale = await s.Client.PutAsJsonAsync("/api/preferences", new { version = legacy.Version, values = calm });
        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        var read = await TaskScenario.Read<Adhd.Application.Preferences.PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences"));
        Assert.Equal((true, false), (read.Values.UiSupports.CalmView, read.Values.UiSupports.Nudges));
        var other = await TaskScenario.User(app);
        Assert.False((await TaskScenario.Read<Adhd.Application.Preferences.PreferencesSnapshot>(await other.Client.GetAsync("/api/preferences"))).Values.UiSupports.CalmView);
    }

    [Fact]
    public async Task EnergyFilterReturnsOnlyMatchingOwnDemand()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        async Task Energy(Guid id, string? level)
        {
            var task = await s.Get(id);
            var r = await s.Client.PutAsJsonAsync($"/api/tasks/{id}/energy", new { version = task.Version, energyDemand = level }); Assert.True(r.IsSuccessStatusCode, await r.Content.ReadAsStringAsync());
        }
        var low = await s.Root("Hafif"); var high = await s.Root("Ağır"); var none = await s.Root("Belirsiz");
        await Energy(low.Id, "Low"); await Energy(high.Id, "High");
        var page = await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks?energyDemand=Low"));
        Assert.Equal(new[] { low.Id }, page.Items.Select(x => x.Id));
        Assert.Equal(3, (await TaskScenario.Read<TaskPage>(await s.Client.GetAsync("/api/tasks"))).Total);
        var other = await TaskScenario.User(app);
        Assert.Empty((await TaskScenario.Read<TaskPage>(await other.Client.GetAsync("/api/tasks?energyDemand=Low"))).Items);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/tasks?energyDemand=Sleepy")).StatusCode);
    }
}
