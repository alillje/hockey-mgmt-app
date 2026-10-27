using HockeyTrainer.Domain.Models;

namespace HockeyTrainer.Application.Repositories;

public interface ICatalogRepository
{
    Task<List<AgeGroup>> GetAgeGroupsAsync(CancellationToken cancellationToken);
}
