using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Collections;
using Adhd.Application.Focus;
using Adhd.Application.Planning;
using Adhd.Application.Preferences;
using Adhd.Application.Scheduling;
using Adhd.Application.Support;
using Adhd.Application.Tasks;
using Adhd.Application.Work;
using Adhd.Domain.Focus;
using Adhd.Domain.Support;
using Adhd.Domain.Tasks;
using Microsoft.EntityFrameworkCore;
using static Adhd.IntegrationTests.ManualPlanningTests;

namespace Adhd.IntegrationTests;

public sealed class SupportTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 15, 6, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Send(TaskScenario s, HttpMethod method, string path, object body, string? key = null) => ManualPlanningTests.Send(s, method, path, JsonSerializer.SerializeToElement(body, Json), key);
    private static async Task<T> Ok<T>(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { Assert.True(r.StatusCode == status, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<T>(r); }
    private static async Task<NoteView> Note(TaskScenario s, string text = "Sonra bunu yap", NoteKind kind = NoteKind.Distraction, Guid? task = null) => await Ok<NoteView>(await Send(s, HttpMethod.Post, "/api/notes", new NoteFields(kind, text, task)), HttpStatusCode.Created);
    private static async Task Enable(TaskScenario s, bool value)
    {
        var p = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); Assert.Equal(HttpStatusCode.OK, (await s.Client.PutAsJsonAsync("/api/preferences", new { version = p.Version, values = p.Values with { SupportEnabled = value } })).StatusCode);
    }
    [Fact]
    public async Task NotesAreVersionedSoftDeletedBoundedAndOwnerScopedWithFrozenDailyZone()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var task = await s.Root(); var note = await Note(s, task: task.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(other, HttpMethod.Put, $"/api/notes/{note.Id}", new { version = note.Version, text = "yabancı" })).StatusCode);
        var edited = await Ok<NoteView>(await Send(s, HttpMethod.Put, $"/api/notes/{note.Id}", new { version = note.Version, text = "Güncel bağlam", dueAt = Morning.AddDays(1) })); Assert.Equal(note.Version + 1, edited.Version);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Put, $"/api/notes/{note.Id}", new { version = note.Version, text = "Eski sekme" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/notes", new NoteFields(NoteKind.Daily, "Bugün iyi gidenler", LocalDate: new(2026, 10, 15)))).StatusCode);
        var daily = new UserNote { Id = Guid.CreateVersion7(), UserId = s.UserId, Kind = NoteKind.Daily, Text = "Bugün iyi gidenler", LocalDate = new(2026, 10, 15), TimeZoneId = "Europe/Istanbul", CreatedAt = Morning, UpdatedAt = Morning };
        await using (var seed = fixture.CreateContext()) { seed.Notes.Add(daily); await seed.SaveChangesAsync(); }
        var p = await TaskScenario.Read<PreferencesSnapshot>(await s.Client.GetAsync("/api/preferences")); await s.Client.PutAsJsonAsync("/api/preferences", new { version = p.Version, values = p.Values with { TimeZoneId = "UTC" } });
        var list = await Ok<NotePage>(await s.Client.GetAsync("/api/notes?date=2026-10-15&limit=1")); Assert.Equal(daily.Id, Assert.Single(list.Items).Id); Assert.Equal("Europe/Istanbul", list.Items[0].TimeZoneId);
        await Ok<NoteView>(await Send(s, HttpMethod.Post, $"/api/notes/{edited.Id}/delete", new { version = edited.Version })); Assert.Empty((await Ok<NotePage>(await s.Client.GetAsync($"/api/notes?taskId={task.Id}"))).Items);
        await using var db = fixture.CreateContext(); Assert.Equal("Güncel bağlam", (await db.Notes.SingleAsync(x => x.Id == note.Id)).Text); Assert.NotNull((await db.Notes.SingleAsync(x => x.Id == note.Id)).DeletedAt);
        Assert.Empty((await Ok<NotePage>(await other.Client.GetAsync("/api/notes"))).Items); Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/notes?limit=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/notes", new NoteFields(NoteKind.NextStep, "Bir adım"))).StatusCode);
    }
    [Fact]
    public async Task ConcurrentConversionAndNewKeysProduceOneTaskWithPoolDeadlineAndUnknownEstimate()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var n = await Note(s, "Aklıma gelen ayrıntı"); var pool = await TaskScenario.Read<NamedResourceView>(await s.Client.PostAsJsonAsync("/api/pools", new { name = "Sonra" }));
        var body = new NoteConversion(n.Version, "Araştır", pool.Id, Morning.AddDays(2)); var key = Guid.NewGuid().ToString(); var path = $"/api/notes/{n.Id}/convert";
        var race = await Task.WhenAll(Send(s, HttpMethod.Post, path, body, key), Send(s, HttpMethod.Post, path, body, key)); var a = await Ok<ConvertedNote>(race[0]); var b = await Ok<ConvertedNote>(race[1]); Assert.Equal(a.TaskId, b.TaskId);
        var again = await Ok<ConvertedNote>(await Send(s, HttpMethod.Post, path, body)); Assert.True(again.Replayed); Assert.Equal(a.TaskId, again.TaskId);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, path, body with { Title = "Başka iş" })).StatusCode);
        var task = await s.Get(a.TaskId); Assert.Equal(pool.Id, task.PoolId); Assert.Equal(Morning.AddDays(2), task.DeadlineAt); Assert.Equal(n.Text, task.Description); Assert.Null(task.DirectEstimatedSeconds);
        await using var db = fixture.CreateContext(); Assert.Equal(1, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); Assert.Equal(a.TaskId, (await db.Notes.SingleAsync(x => x.Id == n.Id)).ConvertedTaskId);
    }
    [Fact]
    public async Task ConversionFailureRollsBackTaskNoteEventVersionAndKeyAndRejectsForeignPool()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var n = await Note(s); var foreign = await TaskScenario.Read<NamedResourceView>(await other.Client.PostAsJsonAsync("/api/pools", new { name = "Other" }));
        var path = $"/api/notes/{n.Id}/convert"; Assert.Equal(HttpStatusCode.NotFound, (await Send(s, HttpMethod.Post, path, new NoteConversion(n.Version, "İş", foreign.Id))).StatusCode);
        var before = await Day(s); var key = Guid.NewGuid().ToString(); await using var db = fixture.CreateContext(); await db.Database.ExecuteSqlRawAsync("CREATE FUNCTION reject_note_convert_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.\"Type\"='CreatedFromNote' THEN RAISE EXCEPTION 'test note conversion failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_note_convert_test BEFORE INSERT ON task_events FOR EACH ROW EXECUTE FUNCTION reject_note_convert_test();");
        try
        {
            Assert.Equal(HttpStatusCode.InternalServerError, (await Send(s, HttpMethod.Post, path, new NoteConversion(n.Version, "İş"), key)).StatusCode); Assert.False(await db.Tasks.AnyAsync(x => x.UserId == s.UserId)); Assert.Null((await db.Notes.AsNoTracking().SingleAsync(x => x.Id == n.Id)).ConvertedTaskId); Assert.Equal(before.PlanningVersion, (await Day(s)).PlanningVersion); Assert.False(await db.IdempotencyRecords.AnyAsync(x => x.UserId == s.UserId && x.Key == key));
        }
        finally { await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_note_convert_test ON task_events; DROP FUNCTION reject_note_convert_test();"); }
        await Ok<ConvertedNote>(await Send(s, HttpMethod.Post, path, new NoteConversion(n.Version, "İş"), key));
    }
    [Fact]
    public async Task ReturnContextUsesActualSubtaskSegmentNotesAndCompletionAndEmptyContextStaysNull()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var root = await s.Root(); var empty = await Ok<ReturnContext>(await s.Client.GetAsync($"/api/tasks/{root.Id}/return-context")); Assert.Null(empty.LastWork); Assert.Null(empty.LastNote); Assert.Null(empty.LastCompletion);
        var a = await s.Child(root.Id, "İlk"); var b = await s.Child(root.Id, "Sonraki"); await s.Define(a.Id, true, 600); await s.Define(b.Id, true, 300); var w = await WorkSessionTests.Started(s, a.Id);
        app.Clock.Now = Morning.AddMinutes(5); await s.State(a.Id, TaskAction.Complete); var note = await Note(s, "İkinci adımda örneği aç", NoteKind.NextStep, b.Id);
        var context = await Ok<ReturnContext>(await s.Client.GetAsync($"/api/tasks/{root.Id}/return-context")); Assert.Equal(w.Id, context.LastWork!.WorkSessionId); Assert.Equal(a.Id, context.LastWork.TaskId); Assert.Equal(a.Id, context.LastCompletion!.TaskId); Assert.Equal(note.Id, context.NextStepNote!.Id); Assert.Equal(b.Id, context.SuggestedStep!.Id); Assert.Equal(1, context.OpenDirectTaskCount);
        var other = await TaskScenario.User(app); Assert.Equal(HttpStatusCode.NotFound, (await other.Client.GetAsync($"/api/tasks/{root.Id}/return-context")).StatusCode);
    }
    [Fact]
    public async Task DailyCriticalContainerEnergyAndDisableAreSoftAndInvalidateStaleProposals()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s); var high = await s.Root("Ağır"); var group = await s.Root("Önemli proje"); var low = await s.Child(group.Id, "Küçük"); await s.Define(high.Id, true, 1800); await s.Define(low.Id, true, 1800);
        await Ok<TaskView>(await Send(s, HttpMethod.Put, $"/api/tasks/{high.Id}/energy", new { version = (await s.Get(high.Id)).Version, energyDemand = "High" })); await Ok<TaskView>(await Send(s, HttpMethod.Put, $"/api/tasks/{low.Id}/energy", new { version = (await s.Get(low.Id)).Version, energyDemand = "Low" }));
        var old = await SchedulingHttpTests.Preview(s, high.Id, group.Id); var day = await Ok<SupportDayView>(await Send(s, HttpMethod.Put, "/api/support/days/2026-10-15", new SupportDayChange(0, EnergyLevel.Low, [group.Id])));
        Assert.Equal(HttpStatusCode.Conflict, (await SchedulingHttpTests.Apply(s, old.ProposalId)).StatusCode); var p = await SchedulingHttpTests.Preview(s, high.Id, group.Id); Assert.Equal(low.Id, p.Blocks.First(x => x.TaskId.HasValue).TaskId); Assert.Equal("heuristic-v3", p.AlgorithmVersion);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Put, "/api/support/days/2026-10-15", new SupportDayChange(day.Version, EnergyLevel.Low, [high.Id, group.Id, low.Id, Guid.NewGuid()]))).StatusCode);
        day = await Ok<SupportDayView>(await Send(s, HttpMethod.Put, "/api/support/days/2026-10-15", new SupportDayChange(day.Version, EnergyLevel.High, [low.Id, high.Id]))); Assert.Equal(new[] { low.Id, high.Id }, day.CriticalTaskIds);
        await Enable(s, false); p = await SchedulingHttpTests.Preview(s, high.Id, group.Id); Assert.Equal(high.Id, p.Blocks.First(x => x.TaskId.HasValue).TaskId); Assert.Equal("heuristic-v2", p.AlgorithmVersion);
    }
    [Fact]
    public async Task FiveMinuteStartUsesRealFocusAndDisabledSupportsStillAllowOrdinaryFocus()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var t = await s.Root(); var key = Guid.NewGuid().ToString(); var body = new { taskId = t.Id };
        var f = await Ok<FocusView>(await Send(s, HttpMethod.Post, "/api/support/quick-start", body, key), HttpStatusCode.Created); Assert.Equal(300, f.Settings.WorkSeconds); app.Clock.Now = Morning.AddMinutes(7);
        f = await Ok<FocusView>(await s.Client.GetAsync($"/api/focus-sessions/{f.Id}")); Assert.Equal(120m, f.OvertimeSeconds); Assert.Equal(TaskState.InProgress, (await s.Get(t.Id)).State);
        f = await Ok<FocusView>(await Send(s, HttpMethod.Post, $"/api/focus-sessions/{f.Id}/finish", new FocusCommand(f.Version, f.WorkSessionVersion)));
        await Enable(s, false); var replay = await Ok<FocusView>(await Send(s, HttpMethod.Post, "/api/support/quick-start", body, key), HttpStatusCode.Created); Assert.Equal(f.Id, replay.Id);
        Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/support/quick-start", body)).StatusCode); await FocusTests.Start(s); Assert.Equal(420m, (await TaskScenario.Read<TaskTimeView>(await s.Client.GetAsync($"/api/tasks/{t.Id}/time"))).DirectActualSeconds);
    }
    [Theory] [InlineData("Preview")] [InlineData("Auto")]
    public async Task RescueUsesExistingEnginePreservesFixedAndActualAndReportsUnplaced(string mode)
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); await SchedulingHttpTests.Configure(s, mode); var a = await s.Root("React"); var b = await s.Root("Backend"); await s.Define(a.Id, true, 3600); await s.Define(b.Id, true, 7200);
        var first = await Create(s, a.Id, Morning, Morning.AddHours(1)); await Create(s, b.Id, Morning.AddHours(1), Morning.AddHours(2)); var fixedBlock = await Create(s, null, Morning.AddHours(2), Morning.AddMinutes(150), "Break", isFixed: true);
        var block = first.Schedules[0]; var w = await Ok<WorkView>(await Send(s, HttpMethod.Post, "/api/work-sessions/start", new { taskId = a.Id, scheduleId = block.Id, scheduleVersion = block.Version }), HttpStatusCode.Created); app.Clock.Now = Morning.AddMinutes(20);
        var version = (await Day(s)).PlanningVersion; var body = new { date = "2026-10-15", taskIds = new[] { a.Id, b.Id }, expectedPlanningVersion = version }; var key = Guid.NewGuid().ToString(); var p = await Ok<SchedulingPreviewView>(await Send(s, HttpMethod.Post, "/api/support/rescue", body, key));
        Assert.Contains(p.Unplaced, x => x.TaskId == b.Id && x.RemainingSeconds == 1800); Assert.Contains(p.Blocks, x => x.ExistingScheduleId == fixedBlock.Schedules[0].Id && x.StartsAt == Morning.AddHours(2)); Assert.Equal(mode == "Auto", p.Applied is not null);
        Assert.Equal(p.ProposalId, (await Ok<SchedulingPreviewView>(await Send(s, HttpMethod.Post, "/api/support/rescue", body, key))).ProposalId); Assert.Equal(1200m, (await TaskScenario.Read<WorkView>(await s.Client.GetAsync($"/api/work-sessions/{w.Id}"))).ActiveSeconds);
        if (mode == "Preview") Assert.Equal(version, (await Day(s)).PlanningVersion);
        await Enable(s, false); Assert.Equal(HttpStatusCode.Conflict, (await Send(s, HttpMethod.Post, "/api/support/rescue", new { date = "2026-10-15", taskIds = new[] { a.Id } })).StatusCode);
    }
    [Fact]
    public async Task EndPreparationReturnsBoundedOpenDayWorkWithoutMovingOrDuplicatingTasks()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); await Create(s, a.Id, Morning, Morning.AddHours(1)); await Ok<SupportDayView>(await Send(s, HttpMethod.Put, "/api/support/days/2026-10-15", new SupportDayChange(0, null, [b.Id])));
        var before = await Day(s); var prep = await Ok<DayEndPreparation>(await s.Client.GetAsync("/api/support/days/2026-10-15/end-preparation?limit=1")); Assert.Equal(2, prep.OpenWork.Total); Assert.Single(prep.OpenWork.Items); Assert.Contains("Carry", prep.AvailableActions); Assert.Equal(before.PlanningVersion, prep.OpenWork.PlanningVersion); Assert.Equal(before.CurrentRevisionId, (await Day(s)).CurrentRevisionId);
        await using var db = fixture.CreateContext(); Assert.Equal(2, await db.Tasks.CountAsync(x => x.UserId == s.UserId)); Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId && x.LocalDate == new DateOnly(2026, 10, 16)));
    }
    [Fact]
    public async Task DistractionFromWorkUsesItsRealTaskAndRejectsMismatchedOrForeignContext()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app); var a = await s.Root(); var b = await s.Root(); var work = await WorkSessionTests.Started(s, a.Id);
        var note = await Ok<NoteView>(await Send(s, HttpMethod.Post, "/api/notes", new NoteFields(NoteKind.Distraction, "Dönünce örneği kontrol et", WorkSessionId: work.Id)), HttpStatusCode.Created); Assert.Equal(a.Id, note.TaskId);
        Assert.Equal(note.Id, (await Ok<ReturnContext>(await s.Client.GetAsync($"/api/tasks/{a.Id}/return-context"))).LastNote!.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await Send(s, HttpMethod.Post, "/api/notes", new NoteFields(NoteKind.Distraction, "Yanlış bağ", b.Id, work.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Send(other, HttpMethod.Post, "/api/notes", new NoteFields(NoteKind.Distraction, "Yabancı", WorkSessionId: work.Id))).StatusCode);
    }
}
