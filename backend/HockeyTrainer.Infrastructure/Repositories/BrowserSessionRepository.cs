using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class BrowserSessionRepository(HockeyDbContext database) : IBrowserSessionRepository
{
    public async Task AddAsync(BrowserSession session, CancellationToken ct)
    {
        database.BrowserSessions.Add(session);
        await database.SaveChangesAsync(ct);
    }

    public Task<BrowserSession?> GetAsync(string hash, CancellationToken ct) =>
        database.BrowserSessions.AsNoTracking().SingleOrDefaultAsync(s => s.IdHash == hash, ct);

    public async Task<bool> AcquireRefreshAsync(string hash, long now, long leaseUntil, CancellationToken ct) =>
        await database.BrowserSessions.Where(s => s.IdHash == hash && s.RefreshLeaseUntil <= now &&
            s.AccessExpiresAt <= now + 60 && s.AbsoluteExpiresAt > now && s.IdleExpiresAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(row => row.RefreshLeaseUntil, leaseUntil), ct) == 1;

    public async Task<bool> SaveRefreshAsync(BrowserSession session, long leaseUntil, CancellationToken ct) =>
        await database.BrowserSessions.Where(s => s.IdHash == session.IdHash && s.RefreshLeaseUntil == leaseUntil)
            .ExecuteUpdateAsync(s => s.SetProperty(row => row.ProtectedTokens, session.ProtectedTokens)
                .SetProperty(row => row.AccessExpiresAt, session.AccessExpiresAt)
                .SetProperty(row => row.IdleExpiresAt, session.IdleExpiresAt)
                .SetProperty(row => row.RefreshLeaseUntil, 0L), ct) == 1;

    public async Task TouchAsync(string hash, long now, long idleExpiresAt, CancellationToken ct) =>
        await database.BrowserSessions.Where(s => s.IdHash == hash && s.IdleExpiresAt > now &&
            s.AbsoluteExpiresAt > now && s.IdleExpiresAt < idleExpiresAt - 60)
            .ExecuteUpdateAsync(s => s.SetProperty(row => row.IdleExpiresAt, idleExpiresAt), ct);

    public async Task DeleteAsync(string hash, CancellationToken ct) =>
        await database.BrowserSessions.Where(s => s.IdHash == hash).ExecuteDeleteAsync(ct);

    public async Task DeleteExpiredAsync(long now, CancellationToken ct) =>
        await database.BrowserSessions.Where(s => s.AbsoluteExpiresAt <= now || s.IdleExpiresAt <= now).ExecuteDeleteAsync(ct);
}
