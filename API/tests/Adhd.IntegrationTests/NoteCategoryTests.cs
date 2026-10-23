using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Support;
using Adhd.Domain.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Adhd.IntegrationTests;

// Hesaba özel renkli kategori, başlıklı/toggle not, listeden ayrı NextStep ve korunan eski notlar.
public sealed class NoteCategoryTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static readonly DateTimeOffset Morning = new(2026, 10, 28, 6, 0, 0, TimeSpan.Zero);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
    private static Task<HttpResponseMessage> Post(TaskScenario s, string path, object body) => s.Client.PostAsJsonAsync(path, body, Json);
    private static Task<HttpResponseMessage> Put(TaskScenario s, string path, object body) => s.Client.PutAsJsonAsync(path, body, Json);
    private static async Task<T> Ok<T>(HttpResponseMessage r, HttpStatusCode status = HttpStatusCode.OK) { Assert.True(r.StatusCode == status, await r.Content.ReadAsStringAsync()); return await TaskScenario.Read<T>(r); }
    private static async Task Fails(HttpResponseMessage r, HttpStatusCode status, string code) { var body = await r.Content.ReadAsStringAsync(); Assert.True(r.StatusCode == status, body); Assert.Contains(code, body); }
    private static Task<NoteCategoryList> List(TaskScenario s) => s.Client.GetAsync("/api/note-categories").ContinueWith(t => Ok<NoteCategoryList>(t.Result)).Unwrap();
    private static async Task<NoteCategoryView> Create(TaskScenario s, string name, NoteCategoryColor color = NoteCategoryColor.Blue, bool pin = false) =>
        await Ok<NoteCategoryView>(await Post(s, "/api/note-categories", new NoteCategoryFields(name, color, true, pin)), HttpStatusCode.Created);
    private static async Task<NoteView> Note(TaskScenario s, NoteFields fields) => await Ok<NoteView>(await Post(s, "/api/notes", fields), HttpStatusCode.Created);
    private static Task<NotePage> Notes(TaskScenario s, string query = "") => s.Client.GetAsync("/api/notes" + query).ContinueWith(t => Ok<NotePage>(t.Result)).Unwrap();

    [Fact]
    public async Task NewUserGetsOneWarningCategoryAndCategoriesAreOwnerScopedVersionedTurkishUniqueAndOrdered()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var initial = await List(s); var warning = Assert.Single(initial.Items);
        Assert.Equal((NoteCategory.DefaultWarningName, NoteCategoryColor.Red, true, true, (DateTimeOffset?)null), (warning.Name, warning.Color, warning.ShowInBar, warning.PinInAll, warning.RemovedAt));
        Assert.Equal((NoteViewMode.Cards, NoteViewMode.List), (initial.AllViewMode, initial.TaskViewMode));
        var stats = await Create(s, "İstatistik", NoteCategoryColor.Teal); await Fails(await Post(s, "/api/note-categories", new NoteCategoryFields("istatistik", NoteCategoryColor.Gray)), HttpStatusCode.Conflict, "note_category_name_taken");
        await Fails(await Post(s, "/api/note-categories", new NoteCategoryFields("  ", NoteCategoryColor.Gray)), HttpStatusCode.BadRequest, "note_category_name_invalid");
        await Fails(await Post(s, "/api/note-categories", new NoteCategoryFields(new string('a', 41), NoteCategoryColor.Gray)), HttpStatusCode.BadRequest, "note_category_name_invalid");
        Assert.Equal("İstatistik", (await Create(other, "İstatistik")).Name); Assert.Equal(2, (await List(other)).Items.Length);
        await Fails(await Put(other, $"/api/note-categories/{stats.Id}", new NoteCategoryChange(stats.Version, "Yabancı", NoteCategoryColor.Gray, true, false, NoteViewMode.List)), HttpStatusCode.NotFound, "note_category_not_found");
        var renamed = await Ok<NoteCategoryView>(await Put(s, $"/api/note-categories/{stats.Id}", new NoteCategoryChange(stats.Version, "Ders", NoteCategoryColor.Green, false, true, NoteViewMode.List)));
        Assert.Equal(("Ders", NoteCategoryColor.Green, false, true, NoteViewMode.List, stats.Version + 1), (renamed.Name, renamed.Color, renamed.ShowInBar, renamed.PinInAll, renamed.ViewMode, renamed.Version));
        await Fails(await Put(s, $"/api/note-categories/{stats.Id}", new NoteCategoryChange(stats.Version, "Eski sekme", NoteCategoryColor.Gray, true, false, NoteViewMode.Cards)), HttpStatusCode.Conflict, "version_conflict");
        var home = await Create(s, "Ev"); var books = await Create(s, "Kitaplar");
        Assert.Equal(new[] { "Uyarı", "Ders", "Ev", "Kitaplar" }, (await List(s)).Items.Select(x => x.Name));
        await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{books.Id}/move", new NoteCategoryMove(books.Version, warning.Id)));
        Assert.Equal(new[] { "Kitaplar", "Uyarı", "Ders", "Ev" }, (await List(s)).Items.Select(x => x.Name));
        var current = (await List(s)).Items.Single(x => x.Id == books.Id); await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{books.Id}/move", new NoteCategoryMove(current.Version, null)));
        Assert.Equal(new[] { "Uyarı", "Ders", "Ev", "Kitaplar" }, (await List(s)).Items.Select(x => x.Name));
        await Fails(await Post(s, $"/api/note-categories/{home.Id}/move", new NoteCategoryMove(home.Version, home.Id)), HttpStatusCode.BadRequest, "note_category_move_invalid");
        var views = await Ok<NoteSystemViews>(await Put(s, "/api/notes/view-modes", new NoteSystemViews(NoteViewMode.List, NoteViewMode.Cards)));
        Assert.Equal((NoteViewMode.List, NoteViewMode.Cards), (views.AllViewMode, views.TaskViewMode)); Assert.Equal(NoteViewMode.List, (await List(s)).AllViewMode); Assert.Equal(NoteViewMode.List, (await List(other)).TaskViewMode);
    }

    [Fact]
    public async Task RemovedCategoryKeepsItsNotesHidesFromWritesRestoresAndWarningIsNeverReseeded()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app);
        var warning = Assert.Single((await List(s)).Items); var home = await Create(s, "Ev", NoteCategoryColor.Purple);
        var note = await Note(s, new NoteFields(NoteKind.General, "Wi-Fi şifresi kartta", CategoryId: home.Id));
        var removed = await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{home.Id}/remove", new { version = home.Version })); Assert.NotNull(removed.RemovedAt);
        await Fails(await Post(s, $"/api/note-categories/{home.Id}/remove", new { version = removed.Version }), HttpStatusCode.Conflict, "note_category_removed");
        var list = await List(s); Assert.Equal(new[] { warning.Id, home.Id }, list.Items.Select(x => x.Id)); Assert.NotNull(list.Items[1].RemovedAt);
        var kept = Assert.Single((await Notes(s)).Items); Assert.Equal((note.Id, home.Id), (kept.Id, kept.CategoryId)); Assert.Equal(note.Id, Assert.Single((await Notes(s, $"?categoryId={home.Id}")).Items).Id);
        await using (var db = fixture.CreateContext()) Assert.Equal(home.Id, (await db.Notes.SingleAsync(x => x.Id == note.Id)).CategoryId);
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.General, "Yeni", CategoryId: home.Id)), HttpStatusCode.Conflict, "note_category_removed");
        var unchanged = await Ok<NoteView>(await Put(s, $"/api/notes/{note.Id}", new { version = note.Version, text = "Wi-Fi şifresi kartta (güncel)", display = "Short", categoryId = home.Id }));
        Assert.Equal(home.Id, unchanged.CategoryId);
        var newHome = await Create(s, "Ev"); await Fails(await Post(s, $"/api/note-categories/{home.Id}/restore", new { version = removed.Version }), HttpStatusCode.Conflict, "note_category_name_taken");
        await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{newHome.Id}/remove", new { version = newHome.Version }));
        var restored = await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{home.Id}/restore", new { version = removed.Version })); Assert.Null(restored.RemovedAt);
        Assert.Equal(new[] { "Uyarı", "Ev" }, (await List(s)).Items.Where(x => x.RemovedAt == null).Select(x => x.Name));
        await Ok<NoteCategoryView>(await Post(s, $"/api/note-categories/{warning.Id}/remove", new { version = warning.Version }));
        var after = await List(s); Assert.DoesNotContain(after.Items, x => x.Name == NoteCategory.DefaultWarningName && x.RemovedAt == null);
        Assert.Single(after.Items, x => x.Name == NoteCategory.DefaultWarningName);
    }

    [Fact]
    public async Task NoteShapesAreValidatedNextStepStaysOutOfListsAndViewsFilterSearchAndRestore()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning; var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var warning = Assert.Single((await List(s)).Items); var study = await Create(s, "Ders", NoteCategoryColor.Teal); var task = await s.Root("Kargo iadesi");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.General, "Kısa", Title: "Başlık")), HttpStatusCode.BadRequest, "note_title_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.General, "Ayrıntı", Display: NoteDisplay.Detailed)), HttpStatusCode.BadRequest, "note_title_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.General, "Ayrıntı", Title: new string('b', 201), Display: NoteDisplay.Toggle)), HttpStatusCode.BadRequest, "note_title_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.NextStep, "Adım", task.Id, Title: "x", Display: NoteDisplay.Detailed)), HttpStatusCode.BadRequest, "note_next_step_shape");
        await Fails(await Post(other, "/api/notes", new NoteFields(NoteKind.General, "Yabancı", CategoryId: study.Id)), HttpStatusCode.NotFound, "note_category_not_found");
        var lesson = await Note(s, new NoteFields(NoteKind.General, "H0: fark yok.\nH1: fark var.", Title: "Hipotez testleri", CategoryId: study.Id, Display: NoteDisplay.Detailed));
        Assert.Equal(("Hipotez testleri", NoteDisplay.Detailed, study.Id, (string?)null), (lesson.Title, lesson.Display, lesson.CategoryId, lesson.TaskTitle));
        var toggle = await Note(s, new NoteFields(NoteKind.General, "Adaptör\nSu", task.Id, Title: "  Kontrol listesi  ", Display: NoteDisplay.Toggle));
        Assert.Equal(("Kontrol listesi", "Kargo iadesi"), (toggle.Title, toggle.TaskTitle));
        var alert = await Note(s, new NoteFields(NoteKind.General, "Kira otomatik değil", CategoryId: warning.Id)); var step = await Note(s, new NoteFields(NoteKind.NextStep, "Dosyayı aç", task.Id));
        var all = await Notes(s); Assert.Equal(3, all.Total); Assert.DoesNotContain(all.Items, x => x.Id == step.Id);
        Assert.Equal(new[] { toggle.Id }, (await Notes(s, $"?taskId={task.Id}")).Items.Select(x => x.Id)); Assert.Equal(new[] { toggle.Id }, (await Notes(s, "?taskLinked=true")).Items.Select(x => x.Id));
        Assert.Equal(step.Id, Assert.Single((await Notes(s, "?kind=NextStep")).Items).Id);
        Assert.Equal(new[] { toggle.Id, lesson.Id }, (await Notes(s, "?excludePinned=true")).Items.Select(x => x.Id)); Assert.Equal(new[] { alert.Id }, (await Notes(s, $"?categoryId={warning.Id}")).Items.Select(x => x.Id));
        Assert.Equal(new[] { lesson.Id }, (await Notes(s, "?search=hipotez")).Items.Select(x => x.Id)); Assert.Equal(new[] { lesson.Id }, (await Notes(s, "?search=FARK%20VAR")).Items.Select(x => x.Id));
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.GetAsync("/api/notes?search=" + new string('a', 201))).StatusCode);
        var page = await Notes(s, "?limit=2&offset=2"); Assert.Equal((3, 1), (page.Total, page.Items.Length));
        await using (var db = fixture.CreateContext()) Assert.Equal("Dosyayı aç", (await db.Notes.SingleAsync(x => x.Id == step.Id)).Text);
        var glance = await s.Client.GetAsync($"/api/tasks/{task.Id}/return-context"); var context = await Ok<ReturnContext>(glance); Assert.Equal(step.Id, context.NextStepNote!.Id); Assert.Equal("Kargo iadesi", context.NextStepNote.TaskTitle);
        var legacyEdit = await Ok<NoteView>(await Put(s, $"/api/notes/{lesson.Id}", new { version = lesson.Version, text = "Yeni içerik" }));
        Assert.Equal(("Hipotez testleri", NoteDisplay.Detailed, study.Id), (legacyEdit.Title, legacyEdit.Display, legacyEdit.CategoryId));
        var shortened = await Ok<NoteView>(await Put(s, $"/api/notes/{lesson.Id}", new { version = legacyEdit.Version, text = "Yeni içerik", display = "Short" }));
        Assert.Equal(((string?)null, NoteDisplay.Short, (Guid?)null), (shortened.Title, shortened.Display, shortened.CategoryId));
        var deleted = await Ok<NoteView>(await Post(s, $"/api/notes/{alert.Id}/delete", new { version = alert.Version })); Assert.Equal(2, (await Notes(s)).Total);
        await Fails(await Post(s, $"/api/notes/{alert.Id}/restore", new { version = alert.Version }), HttpStatusCode.Conflict, "version_conflict");
        await Fails(await Post(other, $"/api/notes/{alert.Id}/restore", new { version = deleted.Version }), HttpStatusCode.NotFound, "note_not_found");
        var restored = await Ok<NoteView>(await Post(s, $"/api/notes/{alert.Id}/restore", new { version = deleted.Version }));
        Assert.Equal(((DateTimeOffset?)null, (Guid?)warning.Id, "Kira otomatik değil"), (restored.DeletedAt, restored.CategoryId, restored.Text)); Assert.Equal(3, (await Notes(s)).Total);
        await Fails(await Post(s, $"/api/notes/{alert.Id}/restore", new { version = restored.Version }), HttpStatusCode.Conflict, "note_not_deleted");
    }

    [Fact]
    public async Task DailyNotesAreScopedToOwnerAndLocalDateAndDoNotCreatePlans()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); app.Clock.Now = Morning;
        var s = await TaskScenario.User(app); var other = await TaskScenario.User(app);
        var date = new DateOnly(2026, 10, 28); var task = await s.Root("Bağlanmayan görev");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.Daily, "Günsüz")), HttpStatusCode.BadRequest, "note_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.General, "Genel", LocalDate: date)), HttpStatusCode.BadRequest, "note_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.Daily, "Göreve bağlı", task.Id, LocalDate: date)), HttpStatusCode.BadRequest, "note_invalid");
        await Fails(await Post(s, "/api/notes", new NoteFields(NoteKind.Daily, "Sınır dışı", LocalDate: new(1, 1, 1))), HttpStatusCode.BadRequest, "date_invalid");
        Assert.DoesNotContain((await List(s)).Items, x => x.Name == "Gün Notları");
        var created = await Task.WhenAll(
            Note(s, new NoteFields(NoteKind.Daily, "  Günün notu  ", LocalDate: date)),
            Note(s, new NoteFields(NoteKind.Daily, "Yarın", LocalDate: date.AddDays(1))));
        var daily = created[0];
        var dayCategory = Assert.Single((await List(s)).Items, x => x.Name == "Gün Notları");
        Assert.True(dayCategory.ShowInBar);
        Assert.All(created, n => Assert.Equal(dayCategory.Id, n.CategoryId));
        Assert.Equal(2, (await Notes(s, $"?categoryId={dayCategory.Id}")).Total);
        var existingCategory = await Create(other, "gün notları", NoteCategoryColor.Teal);
        var otherNote = await Note(other, new NoteFields(NoteKind.Daily, "Başka hesabın notu", LocalDate: date.AddDays(2)));
        Assert.Equal(existingCategory.Id, otherNote.CategoryId);
        Assert.Equal(2, (await List(other)).Items.Length);
        await Note(s, new NoteFields(NoteKind.General, "Genel"));
        const string query = "?kind=Daily&date=2026-10-28";
        var page = await Notes(s, query);
        Assert.Equal(1, page.Total);
        var saved = Assert.Single(page.Items);
        Assert.Equal((daily.Id, (DateOnly?)date, "Günün notu"), (saved.Id, saved.LocalDate, saved.Text));
        Assert.Empty((await Notes(other, query)).Items);
        await Fails(await Put(other, $"/api/notes/{daily.Id}", new { version = daily.Version, text = "Yabancı" }), HttpStatusCode.NotFound, "note_not_found");
        var edited = await Ok<NoteView>(await Put(s, $"/api/notes/{daily.Id}", new { version = daily.Version, text = "Düzenlendi", display = "Short" }));
        Assert.Equal((DateOnly?)date, edited.LocalDate);
        Assert.Equal(dayCategory.Id, edited.CategoryId);
        var deleted = await Ok<NoteView>(await Post(s, $"/api/notes/{daily.Id}/delete", new { version = edited.Version }));
        Assert.Empty((await Notes(s, query)).Items);
        var restored = await Ok<NoteView>(await Post(s, $"/api/notes/{daily.Id}/restore", new { version = deleted.Version }));
        Assert.Equal(restored, Assert.Single((await Notes(s, query)).Items));
        await using var db = fixture.CreateContext();
        Assert.False(await db.DailyPlans.AnyAsync(x => x.UserId == s.UserId && x.LocalDate == date));
    }

    [Fact]
    public async Task UpgradeKeepsLegacyNotesAndCategorizesDailyNotesOnly()
    {
        await using var db = fixture.CreateContext(); var migrations = db.Database.GetMigrations().ToArray(); var target = Array.FindIndex(migrations, x => x.EndsWith("_NoteCategories", StringComparison.Ordinal));
        Assert.True(target > 0); await db.GetService<IMigrator>().MigrateAsync(migrations[target - 1]);
        var now = Morning; var userId = Guid.NewGuid(); var email = $"{Guid.NewGuid():N}@example.test";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO users ("Id","Email","NormalizedEmail","DisplayName","CreatedAt","Version")
            VALUES ({userId},{email},{email.ToUpperInvariant()},'Eski kullanıcı',{now},1)
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""INSERT INTO user_planning_states ("UserId","PlanningVersion","NotesVersion","SpecialDaysVersion","UpdatedAt") VALUES ({userId},3,5,0,{now})""");
        var taskId = Guid.NewGuid(); await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO tasks ("Id","UserId","Title","State","Priority","CanSplit","HasDirectWork","DirectWorkCompleted","RequiredForParent","SortOrder","CreatedAt","UpdatedAt","Version")
            VALUES ({taskId},{userId},'Eski görev','Pending','Normal',true,true,false,true,1024,{now},{now},1)
            """);
        var ids = new Dictionary<string, Guid> { ["Task"] = Guid.NewGuid(), ["Distraction"] = Guid.NewGuid(), ["Daily"] = Guid.NewGuid(), ["NextStep"] = Guid.NewGuid() };
        foreach (var (kind, id) in ids)
        {
            Guid? link = kind is "Task" or "NextStep" ? taskId : null; DateOnly? day = kind == "Daily" ? new DateOnly(2026, 10, 20) : null;
            await db.Database.ExecuteSqlInterpolatedAsync($"""
                INSERT INTO user_notes ("Id","UserId","TaskId","Kind","Text","LocalDate","TimeZoneId","DueAt","CreatedAt","UpdatedAt","Version")
                VALUES ({id},{userId},{link},{kind},{"Eski " + kind},{day},'Europe/Istanbul',{now.AddDays(1)},{now},{now},2)
                """);
        }
        await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        var notes = await db.Notes.Where(x => x.UserId == userId).ToArrayAsync(); Assert.Equal(4, notes.Length);
        Assert.All(notes, n => Assert.Equal((NoteDisplay.Short, (string?)null, "Eski " + n.Kind), (n.Display, n.Title, n.Text)));
        Assert.All(notes.Where(n => n.Kind != NoteKind.Daily), n => Assert.Equal(((Guid?)null, 2L), (n.CategoryId, n.Version)));
        Assert.Equal(taskId, notes.Single(x => x.Id == ids["Task"]).TaskId); Assert.Equal(new DateOnly(2026, 10, 20), notes.Single(x => x.Id == ids["Daily"]).LocalDate);
        Assert.Equal(now.AddDays(1).ToUnixTimeMilliseconds(), notes.Single(x => x.Id == ids["Distraction"]).DueAt!.Value.ToUnixTimeMilliseconds());
        var categories = await db.NoteCategories.Where(x => x.UserId == userId).ToArrayAsync();
        Assert.Equal(2, categories.Length);
        var seeded = Assert.Single(categories, x => x.Name == NoteCategory.DefaultWarningName);
        var dayCategory = Assert.Single(categories, x => x.Name == "Gün Notları");
        Assert.Equal(((Guid?)dayCategory.Id, 3L), (notes.Single(x => x.Id == ids["Daily"]).CategoryId, notes.Single(x => x.Id == ids["Daily"]).Version));
        Assert.Equal((NoteCategory.DefaultWarningName, NoteCategoryColor.Red, true, true, (DateTimeOffset?)null), (seeded.Name, seeded.Color, seeded.ShowInBar, seeded.PinInAll, seeded.RemovedAt));
        var state = await db.PlanningStates.SingleAsync(x => x.UserId == userId); Assert.Equal((6L, NoteViewMode.Cards, NoteViewMode.List), (state.NotesVersion, state.NotesAllViewMode, state.NotesTaskViewMode));
        await db.GetService<IMigrator>().MigrateAsync(migrations[target - 1]); await db.Database.MigrateAsync(); db.ChangeTracker.Clear();
        Assert.Equal(2, await db.NoteCategories.CountAsync(x => x.UserId == userId)); Assert.Empty(await db.Database.GetPendingMigrationsAsync());
    }
}
