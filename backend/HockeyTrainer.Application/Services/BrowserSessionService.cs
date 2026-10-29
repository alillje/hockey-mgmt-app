using System.Security.Cryptography;
using System.Text;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Errors;
using HockeyTrainer.Domain.Models;
using Microsoft.Extensions.Options;

namespace HockeyTrainer.Application.Services;

public sealed class BrowserSessionService(
    IBrowserSessionRepository browserSessionRepository,
    ISessionIdentityProvider sessionIdentityProvider,
    ISessionTokenProtector sessionTokenProtector,
    IOptions<BrowserSessionOptions> options,
    TimeProvider timeProvider)
{
    private long Now => timeProvider.GetUtcNow().ToUnixTimeSeconds();
    private long IdleExpiry => Now + options.Value.IdleHours * 3600L;

    public async Task<string> CreateAsync(SessionTokens tokens, CancellationToken ct)
    {
        var id = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        await browserSessionRepository.DeleteExpiredAsync(Now, ct);
        await browserSessionRepository.AddAsync(new BrowserSession
        {
            IdHash = Hash(id),
            UserId = tokens.UserId,
            Email = tokens.Email,
            ProtectedTokens = sessionTokenProtector.Protect(tokens),
            AccessExpiresAt = tokens.ExpiresAt,
            AbsoluteExpiresAt = Now + options.Value.MaximumDays * 86400L,
            IdleExpiresAt = IdleExpiry
        }, ct);

        return id;
    }

    public async Task<BrowserSession?> AuthenticateAsync(string id, CancellationToken ct, bool refresh = true)
    {
        if (id.Length != 64 || !id.All(Uri.IsHexDigit))
        {
            return null;
        }

        var hash = Hash(id);
        // Database lease serialises refreshes across processes and App Service instances.
        for (var attempt = 0; attempt < 30; attempt++)
        {
            var session = await browserSessionRepository.GetAsync(hash, ct);
            if (session is null)
            {
                return null;
            }
            if (session.AbsoluteExpiresAt <= Now || session.IdleExpiresAt <= Now)
            {
                await browserSessionRepository.DeleteAsync(hash, ct);

                return null;
            }
            if (!refresh || session.AccessExpiresAt > Now + 60)
            {
                await browserSessionRepository.TouchAsync(hash, Now, IdleExpiry, ct);

                return session;
            }

            var lease = Now + 30;
            if (!await browserSessionRepository.AcquireRefreshAsync(hash, Now, lease, ct))
            {
                await Task.Delay(100, ct);
                continue;
            }
            try
            {
                var tokens = sessionTokenProtector.Unprotect(session.ProtectedTokens);
                var refreshed = await sessionIdentityProvider.RefreshAsync(tokens.RefreshToken, ct);
                if (refreshed.UserId != session.UserId)
                {
                    throw new ApiException(401, "Session expired");
                }
                session.ProtectedTokens = sessionTokenProtector.Protect(refreshed);
                session.AccessExpiresAt = refreshed.ExpiresAt;
                session.IdleExpiresAt = IdleExpiry;
                if (!await browserSessionRepository.SaveRefreshAsync(session, lease, ct))
                {
                    return null;
                }

                return session;
            }
            catch (ApiException exception) when (exception.StatusCode == 401)
            {
                await browserSessionRepository.DeleteAsync(hash, ct);

                return null;
            }
            catch (CryptographicException)
            {
                await browserSessionRepository.DeleteAsync(hash, ct);

                return null;
            }
        }

        throw new ApiException(503, "Session refresh in progress", "Please retry shortly.");
    }

    public async Task SignOutAsync(string? id, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(id))
        {
            return;
        }
        var session = await browserSessionRepository.GetAsync(Hash(id), ct);
        // Revoke locally first, even if Supabase is unavailable. An in-flight refresh cannot recreate it.
        await browserSessionRepository.DeleteAsync(Hash(id), ct);
        if (session is null)
        {
            return;
        }
        try
        {
            await sessionIdentityProvider.SignOutAsync(sessionTokenProtector.Unprotect(session.ProtectedTokens).AccessToken, ct);
        }
        catch (ApiException)
        {
            // Local revocation has succeeded. Never restore the session on provider failure.
        }
        catch (CryptographicException)
        {
        }
    }

    public static string Hash(string id) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(id)));
}
