using HockeyTrainer.Database;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class DatabaseProvisioningTests
{
    private static DatabaseTarget StageTarget() => new("stage", "rg-hockey-stage", "sql-hockey-stage-example",
        "sql-hockey-stage-example.database.windows.net", "hockey-stage", "hockey-mgmt-app-stage",
        Guid.Parse("00112233-4455-6677-8899-aabbccddeeff"), Guid.NewGuid());

    [Fact]
    public void DatabasePreparationRejectsOtherEnvironmentsAndIdentityMixups()
    {
        var target = StageTarget();
        target.Validate();
        var invalid = new[]
        {
            target with { Environment = "prod" },
            target with { DatabaseName = "hockey-prod" },
            target with { ServerHost = "unexpected.database.windows.net" },
            target with { ServerName = "sql-hockey-prod-example" },
            target with { RuntimeIdentityObjectId = Guid.Empty },
            target with { RuntimeIdentityObjectId = target.DeploymentIdentityObjectId },
            target with { RuntimeIdentityName = "hockey-stage-deployer" }
        };
        foreach (var other in invalid) Assert.Throws<InvalidOperationException>(other.Validate);
    }

    [Fact]
    public void RuntimeGrantsPermitOnlyApplicationDataAndMigrationHistoryReads()
    {
        var target = StageTarget();
        var sql = SqlScripts.RuntimeIdentity(target.RuntimeIdentityName, target.RuntimeIdentityObjectId);
        Assert.Contains("WITH SID = 0x33221100554477668899AABBCCDDEEFF, TYPE = E", sql);
        Assert.Contains("sid <> 0x33221100554477668899AABBCCDDEEFF OR type <> 'E'", sql);
        foreach (var table in new[] { "Drills", "Trainings", "TrainingEntries" })
            Assert.Contains($"GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.{table}", sql);
        Assert.Contains("GRANT SELECT ON OBJECT::dbo.__EFMigrationsHistory", sql);
        Assert.DoesNotContain("db_owner", sql);
        Assert.DoesNotContain("ALTER ROLE", sql);
        Assert.DoesNotContain("GRANT CONTROL", sql);
    }

    [Fact]
    public void MigrationRoleCannotAdministerUsersOrGrantItselfDatabaseOwnership()
    {
        var sql = SqlScripts.DeploymentIdentity(Guid.NewGuid());
        Assert.Contains("GRANT CREATE TABLE TO hockey_migrator", sql);
        Assert.Contains("ON SCHEMA::dbo TO hockey_migrator", sql);
        Assert.DoesNotContain("db_owner", sql);
        Assert.DoesNotContain("db_securityadmin", sql);
        Assert.DoesNotContain("GRANT CONTROL", sql);
        Assert.DoesNotContain("GRANT ALTER ANY USER", sql);
    }
}
