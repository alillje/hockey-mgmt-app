using HockeyTrainer.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace HockeyTrainer.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddHockeyApplication(this IServiceCollection services)
    {
        services.AddScoped<AccountService>();
        services.AddScoped<CatalogService>();
        services.AddScoped<WorkspaceService>();
        services.AddScoped<WorkspaceMembershipService>();
        services.AddScoped<HockeyCopyService>();
        services.AddScoped<IHockeyService, HockeyService>();

        return services;
    }
}
