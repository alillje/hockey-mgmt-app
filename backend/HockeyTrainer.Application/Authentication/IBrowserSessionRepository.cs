using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Authentication;

public interface IBrowserSessionRepository
{
    Task AddAsync(BrowserSession session, CancellationToken ct);
    Task<BrowserSession?> GetAsync(string hash, CancellationToken ct);
    Task<bool> AcquireRefreshAsync(string hash, long now, long leaseUntil, CancellationToken ct);
    Task<bool> SaveRefreshAsync(BrowserSession session, long leaseUntil, CancellationToken ct);
    Task TouchAsync(string hash, long now, long idleExpiresAt, CancellationToken ct);
    Task DeleteAsync(string hash, CancellationToken ct);
    Task DeleteExpiredAsync(long now, CancellationToken ct);
}
