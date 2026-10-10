namespace Adhd.Domain.Users;

// Tarayıcı veya API girişi. JWT oturum kimliğini sid olarak taşır, her istekte iptal kontrol edilir.
public sealed class AuthSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string UserAgentFamily { get; set; } = "Other";
    // Bir kez taşınan sid'siz tokenın SHA-256 özeti. Normal girişte null.
    public string? AdoptedTokenHash { get; set; }
}
// ValidAfter öncesi tokenlar tüm cihazlardan çıkış veya parola sıfırlamadan sonra taşınamaz.
public sealed class AuthSessionCutoff
{
    public Guid UserId { get; set; }
    public DateTimeOffset ValidAfter { get; set; }
}
