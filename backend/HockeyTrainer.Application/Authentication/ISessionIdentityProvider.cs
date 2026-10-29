namespace HockeyTrainer.Application.Authentication;

public sealed record SessionTokens(string AccessToken, string RefreshToken, long ExpiresAt, Guid UserId, string Email);

public interface ISessionIdentityProvider
{
    Task SendEmailAsync(string email, CancellationToken ct);
    Task<SessionTokens> VerifyAsync(string email, string code, CancellationToken ct);
    Task<SessionTokens> RefreshAsync(string refreshToken, CancellationToken ct);
    Task SignOutAsync(string accessToken, CancellationToken ct);
}

public interface ISessionTokenProtector
{
    string Protect(SessionTokens tokens);
    SessionTokens Unprotect(string value);
}
