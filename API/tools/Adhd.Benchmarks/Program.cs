using System.Collections.Immutable;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Adhd.Domain.Planning;
using Adhd.Domain.Scheduling;

var output = Path.GetFullPath(args.FirstOrDefault() ?? ".local/mvp29-performance.json");
var first = new DateOnly(2026, 10, 19); var start = PlanTime.DayStart(first, "Europe/Istanbul").AddHours(9);
Guid Id(int n) => Guid.Parse($"00000000-0000-0000-0000-{n:D12}");
var tasks = Enumerable.Range(1, 1000).Select(i => new SchedulingTask(Id(i), EstimatedSeconds: 900, SortOrder: i)).ToImmutableArray();
var days = Enumerable.Range(0, 31).Select(i => new SchedulingSnapshot(first.AddDays(i), "Europe/Istanbul", start.AddDays(-1), 1, tasks, [], [], [new(start.AddDays(i), start.AddDays(i).AddHours(8))], [], new())).ToImmutableArray();
var input = new DistributionSnapshot(days, tasks.Select(x => x.Id).ToImmutableArray(), []);
var engine = new MultiDaySchedulingEngine(new());
for (var i = 0; i < 3; i++) engine.Generate(input);
var times = new List<double>(); var allocations = new List<long>(); DistributionProposal result = null!;
for (var i = 0; i < 20; i++)
{
    var allocated = GC.GetAllocatedBytesForCurrentThread(); var timer = Stopwatch.StartNew(); result = engine.Generate(input); timer.Stop();
    times.Add(timer.Elapsed.TotalMilliseconds); allocations.Add(GC.GetAllocatedBytesForCurrentThread() - allocated);
    if ((i + 1) % 5 == 0) Console.Error.WriteLine($"Measured {i + 1}/20 samples.");
}
var ordered = times.Order().ToArray(); var p95 = ordered[(int)Math.Ceiling(ordered.Length * .95) - 1];
var blocks = result.Days.SelectMany(x => x.Proposal.Blocks).Where(x => x.Kind == ScheduleKind.Work).ToArray();
var planned = blocks.Sum(x => (x.EndsAt - x.StartsAt).Ticks / (decimal)TimeSpan.TicksPerSecond); var remaining = result.Unplaced.Sum(x => x.RemainingSeconds ?? 0);
if (planned + remaining != 900000m || result.HasConstraintConflicts) throw new InvalidOperationException("Benchmark quantity/constraint invariant failed.");
var report = new
{
    capturedAtUtc = DateTimeOffset.UtcNow, framework = RuntimeInformation.FrameworkDescription, os = RuntimeInformation.OSDescription,
    architecture = RuntimeInformation.ProcessArchitecture.ToString(), logicalProcessors = Environment.ProcessorCount,
    taskCount = tasks.Length, dayCount = days.Length, workSecondsPerTask = 900, dailyCapacityHours = 8,
    warmupCount = 3, sampleCount = times.Count, scope = "Pure MultiDaySchedulingEngine.Generate; includes snapshot graph/validation/allocation; excludes HTTP/DB/input construction/JIT warmup",
    milliseconds = new { min = ordered[0], median = (ordered[9] + ordered[10]) / 2, p95, max = ordered[^1], samples = times },
    averageAllocatedBytes = allocations.Average(), peakWorkingSetBytes = Process.GetCurrentProcess().PeakWorkingSet64,
    plannedWorkSeconds = planned, remainingWorkSeconds = remaining, placedBlocks = blocks.Length, unplacedTasks = result.Unplaced.Length,
    targetP95Milliseconds = 2000, targetMet = p95 <= 2000
};
Directory.CreateDirectory(Path.GetDirectoryName(output)!); await File.WriteAllTextAsync(output, JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"p95={p95:F2}ms; targetMet={p95 <= 2000}; planned={planned}; remaining={remaining}; report={output}");
return p95 <= 2000 ? 0 : 2;
