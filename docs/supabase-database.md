# Supabase PostgreSQL setup and Azure SQL retirement

The hosted database is Supabase PostgreSQL. Azure hosts the existing .NET 10 API and compiled React frontend. Supabase Auth is deferred until requested; this change does not add sign-in or team isolation. Local development still defaults to the existing SQLite file, which is not imported or reset.

## Values needed from Supabase

Create a **staging** Supabase project in an appropriate EU region. Production will use a separate project later. Open the project's **Connect → Session pooler** dialog. Copy the exact host and project reference; do not derive the pooler hostname from the region. Use port **5432**, not the transaction pooler on 6543. The session pooler works over IPv4 for Azure hosting and GitHub runners, without the paid direct-connection IPv4 add-on. [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres)

Store these under GitHub **Settings → Environments → stage**:

| Name | Type | Value |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | Secret | `wbnjumvxvxwvbimqjccu` for the selected staging project |
| `SUPABASE_DATABASE_CONNECTION_STRING` | Secret | Standard Session pooler URI, replacing the password placeholder with the project's database password |

For this staging project:

```text
postgresql://postgres.wbnjumvxvxwvbimqjccu:<database-password>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
```

Use the **database password chosen when creating the Supabase project**, not the Supabase account password or an API key. Reset it in the project's database settings if forgotten. URI-reserved characters in the password must be percent-encoded. The workflow accepts this dashboard URI directly and privately converts it to Npgsql's connection-string format, enabling `SSL Mode=VerifyFull`. Npgsql `Host=...;Port=...` strings are also accepted when they use the same `postgres.<project-ref>` account and verified TLS.

The same secret is used by the app and EF migration bundle for this staging POC, as explicitly requested. No custom database roles, passwords, schema grants, or administrator bootstrap are required. Remove `SUPABASE_MIGRATION_CONNECTION_STRING` if you already added it; the workflow no longer reads it. Keep the Azure deployment variables and both staging enablement flags. Do not paste the real connection string/password into chat, committed files, workflow inputs, or frontend variables.

TLS must validate the server. Download the database root CA from Supabase's Database SSL settings if the endpoint's certificate is not already trusted by the host OS. Supply that **public certificate**, not a private key, as `backend/Certificates/supabase-root.crt`, and append `?sslrootcert=Certificates/supabase-root.crt` to the URI (or `Root Certificate=Certificates/supabase-root.crt` to an Npgsql string). CI copies it into the published app and beside the migration bundle before testing/packaging; deployment refuses a configured certificate path when the file is missing. The certificate can be reviewed and committed because it contains no private key or password. It must arrive before the corresponding CI build; deployment never patches a tested ZIP with new files. Do not disable certificate verification. See [Supabase SSL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

No Supabase publishable/anon key, service-role key, project API URL, access token, Google OAuth credential, or Azure SQL administrator group is needed for this database-only integration.

## Database permissions and schemas

The standard `postgres` account has broad project database permissions. Both runtime requests and reviewed maintenance migrations use that account for this staging POC. Before production, revisit separate runtime/migration credentials and least-privilege grants. The backend does not migrate on startup; the deployment bundle creates the `hockey` and `hockey_migrations` schemas and empty tables when first applied.

If custom roles or schemas were already created, do not drop them automatically. Review ownership if an existing schema belongs to `hockey_migrator`; the `postgres` administrator may need role membership to manage existing objects. A fresh project needs no manual role setup.

Keep `hockey` and `hockey_migrations` out of Supabase's exposed Data API schemas. If the app does not use that API, disable it. This application accesses PostgreSQL through C#, so Supabase does not automatically apply the signed-in user's identity to database queries. Team authorization will be implemented later in the API. [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

## Migration and release flow

CI tests PostgreSQL using a disposable container, produces reviewable `postgresql.sql` and a Linux EF migration bundle, and tests applying the bundle twice. It does not connect to Supabase. Successful trusted main builds package those files beside the application ZIP.

**Preview staging database** reviews the selected CI artifact's SQL and checksum without Azure login, database access, or credentials. **Deploy staging application** remains manual and checks the selected artifact's provenance and staging readiness. Once its remaining prerequisites are approved, it stops the app, runs the bundle using the shared database secret, configures the runtime connection using that same secret, deploys/starts the matching application, and checks health, database readiness, and React. Failures after entering maintenance leave the app stopped. There is no automatic destructive schema rollback.

There is no Azure SQL firewall rule, Entra SQL user bootstrap, managed-identity database login, or subscription-provider registration script. Normal schema changes use the reviewed EF bundle with the configured project database connection. If Supabase network restrictions are enabled, a reachable runner/network design must be agreed separately; the workflow does not silently loosen those restrictions.

The first bundle application creates an empty database schema. No examples or SQLite data are imported. Live Supabase connection, database access, persistence across releases, and backup/restore still need verification. Authentication/team gates remain incomplete; no public app deployment is authorized by this database change.

## Remove obsolete Azure resources manually

Removing a resource from an incremental Bicep template does **not** delete the deployed resource. This change does not call Azure. In `rg-hockey-stage`, after preserving any needed data and applying the reviewed hosting cleanup:

1. Confirm Web App → Networking has no VNet integration. Detach the old integration manually if Azure retained it after applying the template.
2. Delete SQL server **sql-hockey-stage-bc3cp6sikr2yw**, including database **hockey-stage**. Preserve/export anything you need first. Earlier setup created an empty schema, but do not assume no one has added data since.
3. Delete VNet **vnet-hockey-stage** after confirming nothing else uses it; its subnet/service endpoint were only for Azure SQL.
4. Delete Key Vault **kv-hockey-bc3cp6sikr2yw** if unused. Normal soft deletion is enough; do not purge it just for this cleanup.
5. The Entra group **Hockey Stage SQL Admins** is no longer needed by this app. Remove it only if it has no other use.

Keep the resource group, **hockey-mgmt-app-stage**, **asp-hockey-stage**, and deployment identity **id-hockey-stage-deploy**, including its federation and role assignment. Keep the subscription and Azure CLI. The B1 plan is retained; changing hosting tier/cost is a separate decision.

Remove GitHub `AZURE_SQL_ADMIN_OBJECT_ID` and `AZURE_SQL_ADMIN_NAME`, plus any unused production equivalents (`AZURE_PROD_SQL_ADMIN_OBJECT_ID`, `AZURE_PROD_SQL_ADMIN_NAME`). Remove obsolete local SQL Server test connections. Keep the Azure deployment variables and both staging enablement flags; see [the variable table](azure-deployment.md).

The next app deployment replaces the existing SQL Server `ConnectionStrings__Hockey` App Service setting with the PostgreSQL runtime secret. Never reuse that Azure SQL connection string for PostgreSQL. Applying IaC alone preserves existing settings and does not set the new secret.
