using Azure.Core;
using Azure.Identity;
using HockeyTrainer.Api.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Database;

// One-time SQL administrator setup only. Regular releases use the standard EF bundle.
internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length != 2 || args[0] is not ("bootstrap" or "preview-bootstrap" or "check"))
        {
            Console.Error.WriteLine("Usage: bootstrap|preview-bootstrap|check <target.json>");
            return 1;
        }
        try
        {
            var target = DatabaseTarget.Load(args[1]);
            var grants = SqlScripts.DeploymentIdentity(target.DeploymentIdentityObjectId) + "\n" +
                SqlScripts.RuntimeIdentity(target.RuntimeIdentityName, target.RuntimeIdentityObjectId);
            Console.WriteLine($"Target: {target.ServerHost}/{target.DatabaseName} (stage only).");
            if (args[0] == "preview-bootstrap")
            {
                Console.WriteLine(grants);
                Console.WriteLine("Bootstrap creates the initial schema using this checkout's reviewed EF migrations, then grants the listed permissions.");
                Console.WriteLine("Preview only: no database connection or changes.");
                return 0;
            }

            using var cancellation = new CancellationTokenSource(TimeSpan.FromMinutes(10));
            var token = await new AzureCliCredential().GetTokenAsync(
                new TokenRequestContext(["https://database.windows.net/.default"]), cancellation.Token);
            var connectionString = new SqlConnectionStringBuilder
            {
                DataSource = $"tcp:{target.ServerHost},1433",
                InitialCatalog = target.DatabaseName,
                Encrypt = true,
                TrustServerCertificate = false,
                ConnectTimeout = 60
            };
            await using var connection = new SqlConnection(connectionString.ConnectionString) { AccessToken = token.Token };
            var options = new DbContextOptionsBuilder<HockeyDbContext>().UseSqlServer(connection,
                sql => sql.EnableRetryOnFailure(12, TimeSpan.FromSeconds(10), [40615])).Options;
            await using var database = new HockeyDbContext(options);
            if (args[0] == "check")
            {
                var permitted = await database.Database.SqlQueryRaw<int>("""
                    SELECT CAST(CASE WHEN HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') = 1
                        AND HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'ALTER') = 1 THEN 1 ELSE 0 END AS int) AS [Value]
                    """).SingleAsync(cancellation.Token);
                if (permitted != 1) throw new InvalidOperationException("The migration role has not been bootstrapped.");
                Console.WriteLine("Verified SQL connectivity and migration permissions before maintenance.");
                return 0;
            }
            var applied = (await database.Database.GetAppliedMigrationsAsync(cancellation.Token)).ToList();
            if (applied.Count > 0 && (await database.Database.GetPendingMigrationsAsync(cancellation.Token)).Any())
                throw new InvalidOperationException("Apply schema updates through the maintenance deployment, not administrator bootstrap.");
            if (applied.Count == 0) await database.Database.MigrateAsync(cancellation.Token);
            await connection.OpenAsync(cancellation.Token);
            await using var command = connection.CreateCommand();
            command.CommandText = grants;
            command.CommandTimeout = 120;
            await command.ExecuteNonQueryAsync(cancellation.Token);
            Console.WriteLine("Bootstrapped the initial schema, scoped migration role, and application table grants. No example data inserted.");
            return 0;
        }
        catch (Exception exception)
        {
            var code = exception is SqlException sql ? $", SQL error {sql.Number}" : "";
            Console.Error.WriteLine($"Bootstrap failed ({exception.GetType().Name}{code}). Check administrator membership, target, and SQL connectivity.");
            return 1;
        }
    }
}
