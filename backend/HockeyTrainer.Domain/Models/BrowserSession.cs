namespace HockeyTrainer.Domain.Models;

public sealed class BrowserSession
{
    public string IdHash { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string ProtectedTokens { get; set; } = string.Empty;
    public long AccessExpiresAt { get; set; }
    public long AbsoluteExpiresAt { get; set; }
    public long IdleExpiresAt { get; set; }
    public long RefreshLeaseUntil { get; set; }
}
