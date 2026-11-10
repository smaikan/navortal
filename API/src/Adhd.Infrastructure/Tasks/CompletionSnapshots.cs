using Adhd.Application.Work;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace Adhd.Infrastructure.Tasks;
internal static class CompletionSnapshots
{
    internal static async Task<Dictionary<Guid, TaskAtStart>> Capture(PlannerDbContext db, Guid user, TaskItem[] tasks, Dictionary<Guid, Adhd.Application.Tasks.TaskView> before, long planningVersion, DateTimeOffset now, CancellationToken ct)
    {
        var completed = tasks.Where(t => t.State == TaskState.Completed && before[t.Id].State != TaskState.Completed && t.HasDirectWork).ToArray();
        if (completed.Length == 0) return [];
        var projects = await db.Projects.AsNoTracking().Where(x=>x.UserId==user).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
        var categories = await db.Categories.AsNoTracking().Where(x=>x.UserId==user).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
        var pools = await db.Pools.AsNoTracking().Where(x=>x.UserId==user).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
        NamedSnapshot? Label(Dictionary<Guid,string> values, Guid? id) => id is {} key && values.TryGetValue(key,out var name) ? new(key,name) : null;
        return completed.ToDictionary(t=>t.Id,t=>new TaskAtStart(2,t.Id,t.Version,t.Title,[],Label(projects,t.ProjectId),Label(pools,t.PoolId),Label(categories,t.CategoryId),[],planningVersion,now));
    }
}
