using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public interface IUserProfileRepository
{
    Task<UserProfile?> FindAsync(Guid userId, CancellationToken cancellationToken);
    Task<List<UserProfile>> GetManyAsync(IEnumerable<Guid> userIds, CancellationToken cancellationToken);
    Task SaveAsync(UserProfile profile, CancellationToken cancellationToken);
}
