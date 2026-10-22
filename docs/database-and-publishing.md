# Database modes and combined publishing

Local development keeps SQLite. Hosted preparation uses SQL Server, including Azure SQL, and publishes React inside ASP.NET Core. Authentication and teams are still pending; staging deployment stays disabled.

## Configuration

| Setting | Local development | Future App Service setting |
| --- | --- | --- |
| `Database__Provider` | `Sqlite` (default) | `SqlServer` |
| `DatabasePath` | `App_Data/hockey.db`, relative to backend content root | Not used |
| `ConnectionStrings__Hockey` | Not needed | SQL connection string below |
| `AllowedHosts` | `localhost;127.0.0.1` | Actual App Service/custom host names, separated by semicolons |

Invalid providers and missing SQL configuration fail startup. SQLite retains its additive upgrades. New databases start empty; neither provider inserts example drills or practices. Existing saved content is preserved. Selecting another provider does not copy data between databases.

App Service's future connection string uses its system-assigned managed identity:

```text
Server=tcp:<sql-server>.database.windows.net,1433;Database=hockey-stage;Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

Store it as an App Service application setting named `ConnectionStrings__Hockey`. It contains no password. The resolved Microsoft.Data.SqlClient 6.1.7 includes Entra authentication; upgrading to version 7 or later requires reviewing the separate Azure authentication extension. See [Microsoft's authentication reference](https://learn.microsoft.com/en-us/sql/connect/ado-net/sql/azure-active-directory-authentication).

The runtime identity still needs a SQL database user with application-table read/write permissions, SELECT on `dbo.__EFMigrationsHistory` for readiness, and narrow network access. Azure Contributor does not grant SQL data access. Keep schema changes with the SQL administrator/migration operator; do not grant the runtime schema-owner permissions. These Azure settings and permissions have **not** been applied by this work.

## Migrations

Only SQL Server uses EF migrations; SQLite keeps its existing initializer. The design-time factory selects SQL Server with an offline placeholder connection. Generating migrations or SQL does not connect to Azure or open the local SQLite database.

```bash
source scripts/toolchain.sh
dotnet tool restore
# For a future model change:
dotnet ef migrations add DescribeTheChange --project backend --output-dir Data/Migrations/SqlServer
# Review the forward migration SQL:
dotnet ef migrations script --idempotent --project backend --output artifacts/migrations/sqlserver.sql
```

The existing initial migration creates drills, practices, ordered entries, indexes, and foreign keys. It inserts no demo content and imports no local saved drills. Its forward SQL contains no table drops; the generated `Down` migration drops tables and is not a recovery procedure. Review each migration and its SQL before applying it. [Microsoft recommends reviewing production migration SQL](https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying).

Apply reviewed SQL through an approved SQL administrator/migration operator after checking the database target and recovery procedure. No migration-apply workflow is supplied yet. Startup and the existing deployment workflow never run `Migrate` or `EnsureCreated` against SQL Server.

`GET /api/health` is process liveness. `GET /api/readiness` checks pending SQL migrations and reads the three application tables. It returns `200 {"status":"ready"}` or generic 503 ProblemDetails without credentials. It does not modify the schema or verify backups or all write permissions.

## Publish one application

```bash
source scripts/toolchain.sh
dotnet restore HockeyTrainer.slnx
dotnet tool restore
npm --prefix frontend ci
npm --prefix frontend run build
bash scripts/publish.sh
python3 scripts/ci/check-published-app.py
```

The result is `artifacts/publish/`, including `wwwroot/index.html` and React assets. SQL is generated separately at `artifacts/migrations/sqlserver.sql` and never executed by publishing. CI prepares both on pull requests. Trusted main pushes include the SQL beside `app.zip` in the existing artifact. Deployment remains manual and blocked by unfinished prerequisites.

Try the published application locally with its own test database:

```bash
cd artifacts/publish
DatabasePath=App_Data/publish-test.db dotnet HockeyTrainer.Api.dll --urls http://127.0.0.1:5180
```

React and the API share port 5180. Refreshing React routes works; unknown API URLs and missing asset files return 404. The existing Vite development workflow remains available on port 5173.

## SQL Server verification

CI starts a disposable SQL Server 2022 container. The SQL test creates a uniquely named database, checks readiness before migration, applies generated SQL, exercises API persistence, repeated practice entries, ordering, categories and deletion protection, restarts the host, reapplies the SQL, and verifies saved data. Cleanup removes only that generated database. The test login needs permission to create/drop disposable databases.

Locally, set `HOCKEY_SQLSERVER_TEST_CONNECTION` in your terminal to a development SQL Server connection string, then run `dotnet test HockeyTrainer.slnx`. Use a dedicated development server. Without this variable the real SQL test reports **skipped**; offline SQL model/script and SQLite/hosting tests still run. Docker is currently stopped here: real SQL execution and Azure managed-identity connectivity remain unverified until their environments run the checks.

Local verification: 18 backend checks pass and the real SQL Server check is skipped. All 10 frontend unit tests and 7 browser workflows pass. The published application passes route/asset/API readiness smoke checks; release packaging includes React and separate SQL without database files. The SQL deployment-readiness flag remains false until real-provider execution is verified; the React hosting flag is true. No Azure resources, permissions, or data were changed.
