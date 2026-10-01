namespace Adhd.Domain.Collections;

public interface INamedResource
{
    Guid Id { get; set; }
    Guid UserId { get; set; }
    string Name { get; set; }
    string? Description { get; set; }
    DateTimeOffset CreatedAt { get; set; }
    DateTimeOffset UpdatedAt { get; set; }
    DateTimeOffset? ArchivedAt { get; set; }
    long Version { get; set; }
}
public sealed class TaskProject : INamedResource
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class TaskPool : INamedResource
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class TaskCategory : INamedResource
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long Version { get; set; } = 1;
}
public sealed class TaskTag : INamedResource
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
    public DateTimeOffset? ArchivedAt { get; set; }
    public long Version { get; set; } = 1;
}
