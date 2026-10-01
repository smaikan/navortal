using System.Text.Json;
using System.Text.Json.Serialization;
using Adhd.Application.Tasks;
using Adhd.Domain.Tasks;
using Adhd.Infrastructure.Persistence;

namespace Adhd.Infrastructure.Tasks;

internal static class TaskHistory
{
    private static readonly JsonSerializerOptions Json = new() { Converters = { new JsonStringEnumConverter() } };
    internal static void Append(PlannerDbContext db, TaskItem task, string type, TaskView? before, object? data = null) => db.TaskEvents.Add(new TaskEvent
    {
        Id = Guid.CreateVersion7(), UserId = task.UserId, TaskId = task.Id, Type = type, Sequence = task.Version, EffectiveAt = task.UpdatedAt,
        Payload = JsonSerializer.Serialize(new { before, after = TaskStore.View(task), data }, Json)
    });
}
