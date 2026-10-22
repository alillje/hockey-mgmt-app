namespace HockeyTrainer.Database;

public static class SqlScripts
{
    public const string MigrationRole = """
        IF DATABASE_PRINCIPAL_ID('hockey_migrator') IS NULL
            CREATE ROLE hockey_migrator AUTHORIZATION dbo;
        GRANT CREATE TABLE TO hockey_migrator;
        GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE, VIEW DEFINITION ON SCHEMA::dbo TO hockey_migrator;
        """;

    public static string DeploymentIdentity(Guid objectId) =>
        EnsureExternalUser("hockey-stage-deployer", objectId) + "\n" + MigrationRole + """

            IF IS_ROLEMEMBER('hockey_migrator', 'hockey-stage-deployer') <> 1
                ALTER ROLE hockey_migrator ADD MEMBER [hockey-stage-deployer];
            """;

    public static string RuntimeIdentity(string name, Guid objectId)
    {
        var principal = Quote(name);
        return EnsureExternalUser(name, objectId) + $"""

            GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Drills TO {principal};
            GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.Trainings TO {principal};
            GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.TrainingEntries TO {principal};
            GRANT SELECT ON OBJECT::dbo.__EFMigrationsHistory TO {principal};
            """;
    }

    private static string EnsureExternalUser(string name, Guid objectId)
    {
        if (objectId == Guid.Empty || string.IsNullOrWhiteSpace(name) || name.Length > 128)
            throw new ArgumentException("A principal name and non-empty object ID are required.");
        // Azure SQL Database accepts an Entra object ID as SID without Graph lookups.
        // This avoids adding Directory Readers permissions to the SQL server identity.
        var sid = "0x" + Convert.ToHexString(objectId.ToByteArray());
        var literal = name.Replace("'", "''");
        return $"""
            IF EXISTS (SELECT 1 FROM sys.database_principals
                       WHERE name = N'{literal}' AND (sid <> {sid} OR type <> 'E'))
                THROW 50001, 'The existing SQL user belongs to a different identity. Review before changing grants.', 1;
            IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'{literal}')
                CREATE USER {Quote(name)} WITH SID = {sid}, TYPE = E;
            """;
    }

    private static string Quote(string name) => "[" + name.Replace("]", "]]") + "]";
}
