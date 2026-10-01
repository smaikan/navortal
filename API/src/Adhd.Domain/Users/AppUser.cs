namespace Adhd.Domain.Users;

public sealed class AppUser
{
    public Guid Id { get; set; }
    public string Email { get; set; } = "";
    public string NormalizedEmail { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public long Version { get; set; } = 1;
}

public sealed class UserPlanningState
{
    public Guid UserId { get; set; }
    public long PlanningVersion { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
