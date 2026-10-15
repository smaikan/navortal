using Adhd.Application.Common;

namespace Adhd.Application.Tasks;

public sealed record TaskBatchCommand(string[] Titles, Guid? PoolId);
public sealed record TaskBatchResult(TaskView[] Items, long PlanningVersion);
public interface ITaskBatchStore { Task<(TaskBatchResult Result, bool Replayed)> CreateAsync(Guid userId, TaskBatchCommand command, string key, CancellationToken ct); }

// En fazla 50 kök görev tek atomik anahtarlı istekte açılır. Aynı anahtar/gövde aynı sonucu, farklı gövde 409 döndürür. Kısmi başarı yok, belirsizde aynı anahtar güvenle denenebilir.
public sealed class TaskBatchService(ITaskBatchStore store)
{
    public const int MaxTitles = 50;
    public Task<(TaskBatchResult Result, bool Replayed)> CreateAsync(Guid userId, TaskBatchCommand command, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok 128 karakter.");
        var titles = (command.Titles ?? []).Select(x => x?.Trim() ?? "").ToArray();
        if (titles.Length is < 1 or > MaxTitles) throw Invalid("task_batch_invalid", "1–50 görev başlığı gönderin.");
        if (titles.Any(x => x.Length is < 1 or > 200)) throw Invalid("task_batch_invalid", "Her başlık 1–200 karakter olmalı.");
        return store.CreateAsync(userId, command with { Titles = titles }, key, ct);
    }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
}
