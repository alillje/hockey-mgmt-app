using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Infrastructure.Repositories;
using HockeyTrainer.Application.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace HockeyTrainer.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddHockeyInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.AddHockeyDatabase(configuration, environment);
        services.AddScoped<DatabaseReadiness>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<ICatalogRepository, CatalogRepository>();
        services.AddScoped<IWorkspaceRepository, WorkspaceRepository>();
        services.AddScoped<IHockeyRepository, HockeyRepository>();

        return services;
    }
}
