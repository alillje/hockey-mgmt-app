using System.Security.Cryptography;
using System.Text;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Errors;
using HockeyTrainer.Domain.Models;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;

namespace HockeyTrainer.Application.Services;

public sealed class BrowserSessionService(
    IBrowserSessionRepository browserSessionRepository,
    ISessionIdentityProvider sessionIdentityProvider,
    ISessionTokenProtector sessionTokenProtector,
    IOptions<BrowserSessionOptions> options,
    TimeProvider timeProvider,
    ILogger<BrowserSessionService> logger)
{
    public const string RefreshPendingTitle = "Session refresh in progress";
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
                // Another owner may have completed a rotation between our read and acquisition.
                session = await browserSessionRepository.GetAsync(hash, ct);
                if (session is null || session.AbsoluteExpiresAt <= Now || session.IdleExpiresAt <= Now)
                {
                    return null;
                }
                if (session.AccessExpiresAt > Now + 60)
                {
                    return session;
                }

                var tokens = sessionTokenProtector.Unprotect(session.ProtectedTokens);
                // Bound the provider request below the lease lifetime. Once rotation starts,
                // persist its result even if the browser disconnects during deployment/navigation.
                using var refreshTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                var refreshed = await sessionIdentityProvider.RefreshAsync(tokens.RefreshToken, refreshTimeout.Token);
                if (refreshed.UserId != session.UserId)
                {
                    throw new ApiException(401, "Session expired");
                }
                session.ProtectedTokens = sessionTokenProtector.Protect(refreshed);
                session.AccessExpiresAt = refreshed.ExpiresAt;
                session.IdleExpiresAt = IdleExpiry;
                if (!await browserSessionRepository.SaveRefreshAsync(session, lease, refreshTimeout.Token))
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
            catch (OperationCanceledException) when (!ct.IsCancellationRequested)
            {
                throw new ApiException(503, "Sign-in unavailable", "Please try again shortly.");
            }
            finally
            {
                // Conditional release cannot clear a newer owner's lease or recreate a revoked row.
                // Cleanup has its own bounded token so a disconnected request cannot skip it.
                using var cleanupTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                try
                {
                    await browserSessionRepository.ReleaseRefreshAsync(hash, lease, cleanupTimeout.Token);
                }
                catch (Exception exception)
                {
                    logger.LogWarning(exception, "Could not release session refresh reservation; it will expire automatically.");
                }
            }
        }

        throw new ApiException(503, RefreshPendingTitle, "Please retry shortly.");
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
