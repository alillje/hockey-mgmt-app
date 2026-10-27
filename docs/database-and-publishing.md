# Database modes and combined application publishing

## Local SQLite

The default provider remains `Sqlite`, stored at `backend/App_Data/hockey.db`. Existing data survives restarts. New databases start empty. `DatabasePath` can select another file. SQLite initialization and legacy upgrades apply only to SQLite; changing the hosted provider does not migrate or reset local data.

## Hosted PostgreSQL

Bicep sets `Database__Provider=PostgreSql` and `ConnectionStrings__Hockey` to an environment-specific Key Vault reference. App Service resolves it using the app managed identity and exposes the value through normal .NET configuration. Local PostgreSQL checks can still supply `ConnectionStrings__Hockey` directly through the environment. Use Supabase's IPv4 session pooler on port 5432 with the standard project database account and verified TLS for this staging POC. Never put a password in committed `appsettings.json`, React configuration, or a workflow input. [Supabase setup and roles](supabase-database.md) lists the required GitHub variables/secrets.

Npgsql supplies EF Core's PostgreSQL provider. Tables use schema `hockey`; migration history uses `hockey_migrations`. PostgreSQL startup never creates tables, applies migrations, seeds content, or uses the SQLite initializer. `/api/readiness` checks database access and applied migrations; `/api/health` remains a process liveness check. Readiness does not prove backups, authentication, or team isolation.

SQL Server support and its initial migrations, database administrator tool, and Azure SQL bootstrap/firewall scripts have been retired. This is a fresh PostgreSQL schema, not an automatic data conversion. Preserve/export Azure SQL data before deleting its server; any SQLite import needs a separately reviewed path.

## Reviewed migrations

```bash
source scripts/toolchain.sh
dotnet tool restore
dotnet ef migrations script --idempotent \
  --project backend/HockeyTrainer.Infrastructure/HockeyTrainer.Infrastructure.csproj \
  --startup-project backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj \
  --output artifacts/migrations/postgresql.sql
```

Generating SQL needs no live database or secret. Inspect migrations before applying them. CI packages the reviewed script and Linux EF bundle from the same commit. For an explicitly selected development PostgreSQL database, set the migration connection in `ConnectionStrings__Hockey` securely and run `dotnet ef database update --project backend/HockeyTrainer.Infrastructure/HockeyTrainer.Infrastructure.csproj --startup-project backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj`. The staging POC shares the standard project account for app access and migrations. Do not use a hosted secret for disposable integration tests; revisit restricted runtime credentials before production.

Application releases stop the app, apply the tested migration bundle, deploy the matching ZIP, then start and check it. The first migration creates empty tables. Later migrations preserve data unless an explicitly reviewed change says otherwise. Application rollback and database restore are separate decisions; the deployment does not automatically run Down migrations.

## Publish and verify

```bash
source scripts/toolchain.sh
dotnet restore HockeyTrainer.slnx
dotnet tool restore
npm --prefix frontend ci
npm --prefix frontend run build
bash scripts/publish.sh
python3 scripts/ci/check-published-app.py
```

Publishing produces `artifacts/publish/` with React under `wwwroot`, and `artifacts/migrations/postgresql.sql` plus the Linux self-contained `efbundle`. It never connects to a database. Trusted main CI runs package those beside `app.zip` and release metadata. Application deployment remains manual and blocked by its outstanding readiness checks.

Try the published app against an isolated SQLite database:

```bash
cd artifacts/publish
DatabasePath=App_Data/publish-test.db dotnet HockeyTrainer.Api.dll --urls http://127.0.0.1:5180
```

React and the API share port 5180. React route refresh works; unknown API URLs and missing assets return 404. Normal Vite development remains on port 5173.

## PostgreSQL verification

CI uses a disposable PostgreSQL 17 service and `HOCKEY_POSTGRES_TEST_CONNECTION`. Integration tests create a uniquely named database, apply migrations, exercise real API persistence and restart behavior, verify relational constraints, and remove only their own test database. The test login needs permission to create/drop disposable databases; never point this variable at Supabase or a shared server.

Without that environment variable, the real PostgreSQL integration check reports skipped locally. SQLite, model/script, hosting, and validation tests still run. The Linux bundle is applied twice to a separate disposable CI database to check repeatability. These tests do not prove connectivity or role grants in your Supabase project; those need live verification after configuration.
