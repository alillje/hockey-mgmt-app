using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public interface IAccountRepository
{
    Task<UserPreferences?> GetAsync(Guid userId, CancellationToken cancellationToken);
    Task SaveAsync(Guid userId, Guid? teamId, CancellationToken cancellationToken);
}
