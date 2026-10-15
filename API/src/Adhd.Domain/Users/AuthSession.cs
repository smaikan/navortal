namespace Adhd.Domain.Users;

// Tarayıcı veya API girişi. JWT kimliği sid olarak taşır, her istekte iptal kontrol edilir.
public sealed class AuthSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastSeenAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string UserAgentFamily { get; set; } = "Other";
    // Bir kere taşınan eski sid'siz tokenın SHA-256 özeti. Normal girişte null.
    public string? AdoptedTokenHash { get; set; }
}
// ValidAfter öncesi eski token artık taşınamaz; bütün cihazlardan çıkış ve parola sıfırlama için. Bkz. ValidAfter
public sealed class AuthSessionCutoff
{
    public Guid UserId { get; set; }
    public DateTimeOffset ValidAfter { get; set; }
}
