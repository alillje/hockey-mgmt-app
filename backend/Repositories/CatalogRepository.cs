using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Repositories;

public sealed class CatalogRepository(HockeyDbContext database)
{
    public Task<List<AgeGroup>> GetAgeGroupsAsync(CancellationToken cancellationToken) => database.AgeGroups
        .AsNoTracking().OrderBy(group => group.SortOrder).ThenBy(group => group.Id).ToListAsync(cancellationToken);
}
