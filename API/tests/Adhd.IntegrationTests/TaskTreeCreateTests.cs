using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Adhd.Application.Tasks;
using Microsoft.EntityFrameworkCore;

namespace Adhd.IntegrationTests;

// Yeni görev iç içe alt görevleriyle tek işlemde açılır; anahtar tekrarı aynı sonucu verir, geçersiz ağaçta hiçbir kayıt kalmaz.
public sealed class TaskTreeCreateTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private static object Leaf(string title) => new { title };
    [Fact]
    public async Task NestedTreeIsAtomicIdempotentOrderedAndParentsAreContainers()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        var body = new
        {
            title = " Tez bölüm 4 ",
            children = new object[]
            {
                new { title = "Tabloları hazırla", children = new[] { Leaf("Tablo 1"), Leaf("Tablo 2") } },
                Leaf("Grafikleri çiz"),
            },
        };
        var key = Guid.NewGuid().ToString();
        var first = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", body, key);
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        var result = await TaskScenario.Read<TaskTreeCreateResult>(first);
        Assert.Equal("Tez bölüm 4", result.Root.Title);
        Assert.Null(result.Root.ParentTaskId);
        Assert.Equal(5, result.Created.Length);
        var replay = await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", body, key);
        Assert.Equal(HttpStatusCode.Created, replay.StatusCode); Assert.True(replay.Headers.Contains("Idempotent-Replay"));
        Assert.Equal(result.Created.Select(x => x.Id), (await TaskScenario.Read<TaskTreeCreateResult>(replay)).Created.Select(x => x.Id));
        Assert.Equal(HttpStatusCode.Conflict, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", new { title = "Başka" }, key)).StatusCode);
        await using var db = fixture.CreateContext();
        var rows = await db.Tasks.Where(x => x.UserId == s.UserId).ToListAsync();
        Assert.Equal(5, rows.Count);
        var root = rows.Single(x => x.ParentTaskId == null);
        var tables = rows.Single(x => x.Title == "Tabloları hazırla");
        // Alt görevi olanlar kapsayıcı, yapraklar kendi işi. Gönderilen sırayı koru.
        Assert.False(root.HasDirectWork); Assert.False(tables.HasDirectWork);
        Assert.All(rows.Where(x => x.Title.StartsWith("Tablo ") || x.Title == "Grafikleri çiz"), x => Assert.True(x.HasDirectWork));
        Assert.Equal(new[] { "Tabloları hazırla", "Grafikleri çiz" }, rows.Where(x => x.ParentTaskId == root.Id).OrderBy(x => x.SortOrder).Select(x => x.Title));
        Assert.Equal(new[] { "Tablo 1", "Tablo 2" }, rows.Where(x => x.ParentTaskId == tables.Id).OrderBy(x => x.SortOrder).Select(x => x.Title));
        Assert.Equal(5, await db.TaskEvents.CountAsync(x => x.UserId == s.UserId && x.Type == "Created"));
        // Okumada yeni ağacı ve sunucunun hesapladığı sayıları kontrol et.
        var summary = await TaskScenario.Read<JsonElement>(await s.Client.GetAsync($"/api/tasks/{root.Id}/summary"));
        Assert.Equal(2, summary.GetProperty("childCount").GetInt32());
    }

    [Fact]
    public async Task InvalidTreesLeaveNothingAndRequireAKeyAndOwnership()
    {
        await using var app = new PlannerFactory(fixture.ConnectionString); var s = await TaskScenario.User(app);
        object Deep(int depth) => depth == 1 ? Leaf("Yaprak") : new { title = $"Seviye {depth}", children = new[] { Deep(depth - 1) } };
        Assert.Equal(HttpStatusCode.BadRequest, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", Deep(6), Guid.NewGuid().ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", Deep(5), Guid.NewGuid().ToString())).StatusCode);
        var many = new { title = "Kök", children = Enumerable.Range(0, 50).Select(i => Leaf($"t{i}")).ToArray() };
        Assert.Equal(HttpStatusCode.BadRequest, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", many, Guid.NewGuid().ToString())).StatusCode);
        var blank = new { title = "Kök", children = new[] { Leaf("Geçerli"), Leaf("   ") } };
        Assert.Equal(HttpStatusCode.BadRequest, (await ManualPlanningTests.Send(s, HttpMethod.Post, "/api/tasks/tree", blank, Guid.NewGuid().ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await s.Client.PostAsJsonAsync("/api/tasks/tree", new { title = "Anahtarsız" })).StatusCode);
        var stranger = await TaskScenario.User(app);
        await using var db = fixture.CreateContext();
        // Sadece geçerli beş seviyeli ağaç kaldı. Hatalı istekler kısmi ya da yabancı hesaba kayıt bırakmadı.
        Assert.Equal(5, await db.Tasks.CountAsync(x => x.UserId == s.UserId));
        Assert.False(await db.Tasks.AnyAsync(x => x.UserId == stranger.UserId));
    }
}
