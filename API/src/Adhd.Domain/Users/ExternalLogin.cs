namespace Adhd.Domain.Users;

public sealed class ExternalLogin
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Provider { get; set; } = "Google";
    public string Subject { get; set; } = "";
}
