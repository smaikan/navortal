using Adhd.Application.Common;

namespace Adhd.Application.Tasks;

public sealed record TaskTreeNode(string Title, TaskTreeNode[]? Children);
public sealed record TaskTreeCreateResult(TaskView Root, TaskView[] Created, long PlanningVersion);
public interface ITaskTreeCreateStore { Task<(TaskTreeCreateResult Result, bool Replayed)> CreateAsync(Guid userId, TaskTreeNode root, string key, CancellationToken ct); }

// Yeni kök görev ve iç içe alt görevleri tek atomik anahtarlı istekte açılır. Kısmi başarı yok; aynı anahtar/gövde aynı sonucu, farklı gövde 409 döndürür.
public sealed class TaskTreeCreateService(ITaskTreeCreateStore store)
{
    public const int MaxNodes = 50;
    public const int MaxDepth = 5;
    public Task<(TaskTreeCreateResult Result, bool Replayed)> CreateAsync(Guid userId, TaskTreeNode root, string key, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128) throw Invalid("idempotency_key_required", "Idempotency-Key gerekli; en çok 128 karakter.");
        var count = 0;
        TaskTreeNode Normalize(TaskTreeNode node, int depth)
        {
            if (depth > MaxDepth) throw Invalid("task_tree_invalid", $"Alt görevler en çok {MaxDepth} seviye olabilir.");
            if (++count > MaxNodes) throw Invalid("task_tree_invalid", $"Tek seferde en çok {MaxNodes} görev eklenebilir.");
            var title = node.Title?.Trim() ?? "";
            if (title.Length is < 1 or > 300) throw Invalid("task_tree_invalid", "Her görev başlığı 1–300 karakter olmalı.");
            return new(title, (node.Children ?? []).Select(child => Normalize(child, depth + 1)).ToArray());
        }
        return store.CreateAsync(userId, Normalize(root, 1), key, ct);
    }
    private static UseCaseException Invalid(string code, string message) => new(ErrorKind.Validation, code, message);
}
