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
    public long NotesVersion { get; set; }
    public long SpecialDaysVersion { get; set; }
    public Adhd.Domain.Support.NoteViewMode NotesAllViewMode { get; set; }
    public Adhd.Domain.Support.NoteViewMode NotesTaskViewMode { get; set; } = Adhd.Domain.Support.NoteViewMode.List;
    public DateTimeOffset UpdatedAt { get; set; }
}
