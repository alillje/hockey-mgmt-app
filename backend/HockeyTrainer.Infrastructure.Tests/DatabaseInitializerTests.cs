using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Infrastructure.Tests;

public sealed class DatabaseInitializerTests
{
    [Fact]
    public async Task FreshSqliteDatabaseHasSchemaAndNoExampleContent()
    {
        var databasePath = Path.Combine(Path.GetTempPath(), $"hockey-infrastructure-{Guid.NewGuid():N}.db");
        var services = new ServiceCollection();
        services.AddDbContext<HockeyDbContext>(options => options.UseSqlite($"Data Source={databasePath}"));
        services.AddSingleton<IAuthenticationContext>(new TestAuthenticationContext(false));

        await using var provider = services.BuildServiceProvider();
        try
        {
            await using var scope = provider.CreateAsyncScope();
            await DatabaseInitializer.InitializeAsync(scope.ServiceProvider);
            var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();

            Assert.Empty(await database.Drills.ToListAsync());
            Assert.Empty(await database.Trainings.ToListAsync());
            Assert.NotEmpty(await database.AgeGroups.ToListAsync());
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            if (File.Exists(databasePath))
            {
                File.Delete(databasePath);
            }
        }
    }

    private sealed class TestAuthenticationContext(bool enabled) : IAuthenticationContext
    {
        public bool Enabled { get; } = enabled;
    }
}
