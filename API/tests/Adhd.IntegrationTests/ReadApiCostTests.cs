using System.Net.Http.Json;
using System.Data.Common;
using System.Diagnostics;
using System.IO.Compression;
using System.Text.Json;
using Adhd.Application.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Adhd.Application.Calendar;
using Adhd.Application.Planning;

namespace Adhd.IntegrationTests;

[Collection("ReadApiPerformance")]
public sealed class ReadApiCostTests(DatabaseFixture fixture) : IClassFixture<DatabaseFixture>
{
    private sealed class Counter : DbCommandInterceptor {
        public long Commands;
        public Dictionary<string,(string Sql,NpgsqlParameter[] Parameters)> Plans = new();
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,CommandEventData data,
            InterceptionResult<DbDataReader> result,CancellationToken ct=default) {
            Interlocked.Increment(ref Commands);
            var kind=command.CommandText.Contains("ranked AS (") ? "calendar-overview" : command.CommandText.Contains("WITH RECURSIVE tree") && command.CommandText.Contains("path") ? "task-detail" : null;
            if(kind is not null) Plans[kind]=(command.CommandText,command.Parameters.Cast<NpgsqlParameter>().Select(p=>p.Clone()).ToArray());
            return ValueTask.FromResult(result);
        }
    }
    private sealed record Sample(double Milliseconds,long AllocatedBytes,long SqlCommands,int BodyBytes,int GzipBytes);
    private static async Task<Sample> Measure(TaskScenario s,Counter counter,string[] routes) {
        var commands=counter.Commands;var bytes=GC.GetTotalAllocatedBytes(true);var watch=Stopwatch.StartNew();var bodies=new List<byte[]>();
        foreach(var route in routes) {using var response=await s.Client.GetAsync(route);response.EnsureSuccessStatusCode();bodies.Add(await response.Content.ReadAsByteArrayAsync());}
        watch.Stop();var allocated=GC.GetTotalAllocatedBytes(true)-bytes;var sql=counter.Commands-commands;
        var gzip=0;foreach(var body in bodies) {using var stream=new MemoryStream();using(var zip=new GZipStream(stream,CompressionLevel.SmallestSize,true))zip.Write(body);gzip+=(int)stream.Length;}
        return new(watch.Elapsed.TotalMilliseconds,allocated,sql,bodies.Sum(x=>x.Length),gzip);
    }
    private static object Summary(List<Sample> samples) {
        double Percent(Func<Sample,double> select,double p) {var a=samples.Select(select).Order().ToArray();return Math.Round(a[(int)Math.Ceiling(a.Length*p)-1],2);}
        return new {samples=samples.Count,p50Ms=Percent(x=>x.Milliseconds,.5),p95Ms=Percent(x=>x.Milliseconds,.95),
            medianAllocatedBytes=Percent(x=>x.AllocatedBytes,.5),sqlCommands=samples.Select(x=>x.SqlCommands).Distinct().Order().ToArray(),
            medianBodyBytes=Percent(x=>x.BodyBytes,.5),medianGzipBytes=Percent(x=>x.GzipBytes,.5)};
    }
    [Fact]
    public async Task ThirtyPairedReadSamplesPreserveTotalsAndRecordApiSqlAllocationAndPayloadCost()
    {
        var path=Environment.GetEnvironmentVariable("ADHD_READ_COST_PATH");
        if(string.IsNullOrWhiteSpace(path)) path=Path.Combine(AppContext.BaseDirectory,".local",$"read-api-cost-{fixture.DatabaseName}.json");
        path=Path.GetFullPath(path);Assert.Contains(".local",path);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var counter=new Counter();
        await using var app=new PlannerFactory(fixture.ConnectionString,services=>services.AddDbContext<PlannerDbContext>(o=>o.AddInterceptors(counter)));
        app.Clock.Now=new DateTimeOffset(2026,10,25,9,0,0,TimeSpan.Zero);var s=await TaskScenario.User(app);var root=await s.Root("Cost fixture root");
        await s.Define(root.Id,true,120,10000);
        await using var db=fixture.CreateContext();
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO tasks SELECT (jsonb_populate_record(NULL::tasks,to_jsonb(t)||
                jsonb_build_object('Id',gen_random_uuid(),'ParentTaskId',t."Id",'Title','Cost child '||n,'DirectEstimatedSeconds',CASE WHEN n%7=0 THEN NULL ELSE 60 END,'TargetBudgetSeconds',NULL))).*
            FROM tasks t CROSS JOIN generate_series(1,999) n WHERE t."UserId"={s.UserId} AND t."Id"={root.Id}
            """);
        var date="2026-10-25";
        var tasks=await db.Tasks.AsNoTracking().Where(x=>x.UserId==s.UserId && x.Id!=root.Id).OrderBy(x=>x.Id).Select(x=>x.Id).Take(11).ToArrayAsync();
        foreach(var id in tasks) {var r=await s.Client.PostAsJsonAsync($"/api/daily-plans/{date}/items",new {taskId=id});r.EnsureSuccessStatusCode();}
        var detail=await TaskScenario.Read<TaskDetailView>(await s.Client.GetAsync($"/api/tasks/{root.Id}/detail-view"));
        Assert.Equal(1000,detail.Progress.TotalTaskCount);Assert.Equal(51540,detail.Workload.KnownEstimatedSeconds);Assert.Equal(142,detail.Workload.UnknownEstimateCount);Assert.Null(detail.Workload.CalculatedTotalSeconds);
        var day=await TaskScenario.Read<DayOverviewView>(await s.Client.GetAsync($"/api/daily-plans/{date}/overview"));Assert.Equal(11,day.Glance.OpenItemCount);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            WITH seed AS (SELECT * FROM day_items WHERE "UserId"={s.UserId} ORDER BY "Id" LIMIT 1)
            INSERT INTO day_items SELECT (jsonb_populate_record(NULL::day_items,to_jsonb(d)||
                jsonb_build_object('Id',gen_random_uuid(),'TaskId',t."Id",'LocalDate','2026-10-25'::date+g.n,'SortOrder',g.n*1024))).*
            FROM seed d CROSS JOIN tasks t CROSS JOIN generate_series(1,4) g(n)
            WHERE t."UserId"={s.UserId} AND t."Id"<>{root.Id}
            """);
        var calendar=await TaskScenario.Read<CalendarOverviewView>(await s.Client.GetAsync("/api/calendar/overview?fromDate=2026-10-25&toDate=2026-12-05"));Assert.Equal(4007,calendar.Days.Sum(x=>x.ItemCount));
        var profiles=new[] {
            (Name:"task-detail-1000",Old:new[] {$"/api/tasks/{root.Id}",$"/api/tasks/{root.Id}/summary",$"/api/tasks/{root.Id}/workload",$"/api/tasks/{root.Id}/time",$"/api/tasks/{root.Id}/progress",$"/api/tasks/{root.Id}/classification"},New:new[] {$"/api/tasks/{root.Id}/detail-view"}),
            (Name:"day-11",Old:new[] {$"/api/daily-plans/{date}",$"/api/schedules?from=2026-10-24T21:00:00Z&to=2026-10-25T21:00:00Z&limit=100",$"/api/daily-plans/{date}/items?limit=100",$"/api/daily-plans/{date}/glance",$"/api/support/days/{date}"},New:new[] {$"/api/daily-plans/{date}/overview"}),
            (Name:"calendar-42-days-4007",Old:Enumerable.Range(0,9).Select(i=>$"/api/calendar/items?fromDate=2026-10-25&toDate=2026-12-05&offset={i*500}&limit=500").ToArray(),New:new[] {"/api/calendar/overview?fromDate=2026-10-25&toDate=2026-12-05"})
        };
        var results=new List<object>();
        foreach(var profile in profiles) {
            var oldSamples=new List<Sample>();var newSamples=new List<Sample>();
            for(var i=0;i<3;i++){await Measure(s,counter,profile.Old);await Measure(s,counter,profile.New);}
            for(var i=0;i<30;i++) {
                if(i%2==0) {oldSamples.Add(await Measure(s,counter,profile.Old));newSamples.Add(await Measure(s,counter,profile.New));}
                else {newSamples.Add(await Measure(s,counter,profile.New));oldSamples.Add(await Measure(s,counter,profile.Old));}
            }
            results.Add(new {profile=profile.Name,oldHttpRequests=profile.Old.Length,newHttpRequests=profile.New.Length,
                baseline=Summary(oldSamples),candidate=Summary(newSamples)});
        }
        var explains=new List<object>();
        await using(var connection=new NpgsqlConnection(fixture.ConnectionString)) {
            await connection.OpenAsync();
            foreach(var (name,query) in counter.Plans) {
                await using var command=new NpgsqlCommand("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+query.Sql,connection);
                command.Parameters.AddRange(query.Parameters.Select(p=>p.Clone()).ToArray());
                var json=Convert.ToString(await command.ExecuteScalarAsync())!;
                using var doc=JsonDocument.Parse(json);var entry=doc.RootElement[0];var nodes=new List<object>();
                void Walk(JsonElement node) {
                    double Number(string key)=>node.TryGetProperty(key,out var value)?value.GetDouble():0;
                    nodes.Add(new {nodeType=node.GetProperty("Node Type").GetString(),index=node.TryGetProperty("Index Name",out var index)?index.GetString():null,
                        rows=Number("Actual Rows"),loops=Number("Actual Loops"),sharedHitBlocks=Number("Shared Hit Blocks"),sharedReadBlocks=Number("Shared Read Blocks"),tempWrittenBlocks=Number("Temp Written Blocks")});
                    if(node.TryGetProperty("Plans",out var children)) foreach(var child in children.EnumerateArray())Walk(child);
                }
                Walk(entry.GetProperty("Plan"));explains.Add(new {profile=name,planningMs=entry.GetProperty("Planning Time").GetDouble(),executionMs=entry.GetProperty("Execution Time").GetDouble(),nodes});
            }
        }
        await File.WriteAllTextAsync(path!,JsonSerializer.Serialize(new {kind="owned-local-testserver-postgres-paired-read-cost",scope="warm API/TestServer plus PostgreSQL; no browser/TLS/network simulation; gzip recompressed estimate; allocations process-wide",warmupPairs=3,pairedSamples=30,calendarBaseline="Complete legacy item pages with the corrected SQL implementation, not a retained pre-change binary; conservative network/projection comparison",results,explains},new JsonSerializerOptions{WriteIndented=true}));
    }
}



// Süre ve bellek ölçümü başka test trafiğine karışmasın. Paralellik testleri Task.WhenAll kullanıyor
[CollectionDefinition("ReadApiPerformance", DisableParallelization = true)]
public sealed class ReadApiPerformanceCollection { }
