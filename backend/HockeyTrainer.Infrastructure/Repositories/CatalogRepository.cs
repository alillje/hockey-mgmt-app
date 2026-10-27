using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Repositories;

public sealed class CatalogRepository(HockeyDbContext database) : ICatalogRepository
{
    public Task<List<AgeGroup>> GetAgeGroupsAsync(CancellationToken cancellationToken) => database.AgeGroups
        .AsNoTracking().OrderBy(group => group.SortOrder).ThenBy(group => group.Id).ToListAsync(cancellationToken);
}
