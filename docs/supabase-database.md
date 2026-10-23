# Supabase PostgreSQL setup and Azure SQL retirement

The hosted database is Supabase PostgreSQL. Azure hosts the .NET 10 API and compiled React frontend. Supabase email sign-in works locally and staging Auth settings are prepared; team isolation is still pending, and the owner approved a shared staging workspace. Local development still defaults to the existing SQLite file, which is not imported or reset.

## Values needed from Supabase

Create a **staging** Supabase project in an appropriate EU region. Production will use a separate project later. Open the project's **Connect → Session pooler** dialog. Copy the exact host and project reference; do not derive the pooler hostname from the region. Use port **5432**, not the transaction pooler on 6543. The session pooler works over IPv4 for Azure hosting and GitHub runners, without the paid direct-connection IPv4 add-on. [Supabase connection options](https://supabase.com/docs/guides/database/connecting-to-postgres)

Store these under GitHub **Settings → Environments → stage → Variables/Secrets**, using the type shown below:

| Name | Type | Value |
| --- | --- | --- |
| `SUPABASE_PROJECT_REF` | Variable | `wbnjumvxvxwvbimqjccu` for the selected staging project |
| `SUPABASE_DATABASE_CONNECTION_STRING` | Secret | Npgsql connection to the standard Session pooler, with the project's database password |

Supabase's official [connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) shows a `postgresql://...` URI. The `Host=...;Password=...` format below comes from the official [Npgsql connection-string documentation](https://www.npgsql.org/doc/connection-string-parameters), because this .NET app uses Npgsql for EF Core. Supabase does not display this exact Npgsql string in its dashboard. For this staging project, map the host, port, database, and username from **Connect → Session pooler** into:

```text
Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.wbnjumvxvxwvbimqjccu;Password="<database-password>";SSL Mode=VerifyFull
```

Use the **database password chosen when creating the Supabase project**, not the Supabase account password or an API key. Reset it in the project's database settings if forgotten. Copy the host, port, and username from **Connect → Session pooler**, then enter them in the Npgsql format above. Replace the placeholder with the real password; keep surrounding double quotes, and double any literal `"` in the password. A dashboard `postgresql://...` URI cannot be used directly in the .NET configuration or workflow. The validator requires the matching `postgres.<project-ref>` account and `SSL Mode=VerifyFull`.

GitHub holds the source connection for this staging POC. Infrastructure apply passes it to Bicep as a secure parameter; Bicep stores it in Key Vault and configures the App Service reference. Migrations use the same GitHub secret directly. No custom database roles, passwords, schema grants, or administrator bootstrap are required. Remove `SUPABASE_MIGRATION_CONNECTION_STRING` if you already added it; the workflow no longer reads it. Keep the Azure deployment variables and both staging enablement flags. Do not paste the real connection string/password into chat, committed files, workflow inputs, or frontend variables.

TLS must validate the server. Download the database root CA from Supabase's Database SSL settings if the endpoint's certificate is not already trusted by the host OS. Supply that **public certificate**, not a private key, as `backend/Certificates/supabase-root.crt`, and add `Root Certificate=Certificates/supabase-root.crt` to the Npgsql string. CI copies it into the published app and beside the migration bundle before testing/packaging; deployment refuses a configured certificate path when the file is missing. The certificate can be reviewed and committed because it contains no private key or password. It must arrive before the corresponding CI build; deployment never patches a tested ZIP with new files. Do not disable certificate verification. See [Supabase SSL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

The stage project URL and publishable key are separate GitHub environment variables for Auth. No service-role key, personal access token, Google OAuth credential, or Azure SQL administrator group is needed for this integration.

## Database permissions and schemas

The standard `postgres` account has broad project database permissions. Both runtime requests and reviewed maintenance migrations use that account for this staging POC. Before production, revisit separate runtime/migration credentials and least-privilege grants. The backend does not migrate on startup; the deployment bundle creates the `hockey` and `hockey_migrations` schemas and empty tables when first applied.

If custom roles or schemas were already created, do not drop them automatically. Review ownership if an existing schema belongs to `hockey_migrator`; the `postgres` administrator may need role membership to manage existing objects. A fresh project needs no manual role setup.

Keep `hockey` and `hockey_migrations` out of Supabase's exposed Data API schemas. If the app does not use that API, disable it. This application accesses PostgreSQL through C#, so Supabase does not automatically apply the signed-in user's identity to database queries. Team authorization will be implemented later in the API. [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

## Migration and release flow

CI tests PostgreSQL using a disposable container, produces reviewable `postgresql.sql` and a Linux EF migration bundle, and tests applying the bundle twice. It does not connect to Supabase. Successful trusted main builds package those files beside the application ZIP.

**Preview staging database** reviews the selected CI artifact's SQL and checksum without Azure login, database access, or credentials. **Staging infrastructure** preview/apply manages the vault secret and app setting. After review, **Initialize staging database** can apply the same bundle while the Azure app is stopped and private; it does not deploy the app. **Deploy staging application** remains manual and checks the selected artifact's provenance and staging readiness. Once its remaining prerequisites are verified, it stops the app, reruns the idempotent bundle, deploys/starts the matching application, refreshes the Key Vault reference, and checks health, database readiness, and React. Failures after entering maintenance leave the app stopped. There is no automatic destructive schema rollback.

There is no Azure SQL firewall rule, Entra SQL user bootstrap, managed-identity database login, or subscription-provider registration script. Normal schema changes use the reviewed EF bundle with the configured project database connection. If Supabase network restrictions are enabled, a reachable runner/network design must be agreed separately; the workflow does not silently loosen those restrictions.

The first bundle application creates an empty database schema. No examples or SQLite data are imported. Live Supabase connection, database access, persistence across releases, and backup/restore still need verification. The shared-workspace staging exception does not waive the database/recovery gates; no public app deployment is authorized by this database change.

## Remove obsolete Azure resources manually

Removing a resource from an incremental Bicep template does **not** delete the deployed resource. This change does not call Azure. In `rg-hockey-stage`, after preserving any needed data and applying the reviewed hosting cleanup:

1. Confirm Web App → Networking has no VNet integration. Detach the old integration manually if Azure retained it after applying the template.
2. Delete SQL server **sql-hockey-stage-bc3cp6sikr2yw**, including database **hockey-stage**. Preserve/export anything you need first. Earlier setup created an empty schema, but do not assume no one has added data since.
3. Delete VNet **vnet-hockey-stage** after confirming nothing else uses it; its subnet/service endpoint were only for Azure SQL.
4. The retired randomly named vault **kv-hockey-bc3cp6sikr2yw** can remain deleted. Keep the new app vault **kv-hockey-stage**, which is provisioned by the current Bicep template.
5. The Entra group **Hockey Stage SQL Admins** is no longer needed by this app. Remove it only if it has no other use.

Keep the resource group, **hockey-mgmt-app-stage**, **asp-hockey-stage**, and deployment identity **id-hockey-stage-deploy**, including its federation and role assignment. Keep the subscription and Azure CLI. The B1 plan is retained; changing hosting tier/cost is a separate decision.

Remove GitHub `AZURE_SQL_ADMIN_OBJECT_ID` and `AZURE_SQL_ADMIN_NAME`, plus any unused production equivalents (`AZURE_PROD_SQL_ADMIN_OBJECT_ID`, `AZURE_PROD_SQL_ADMIN_NAME`). Remove obsolete local SQL Server test connections. Keep the Azure deployment variables and both staging enablement flags; see [the variable table](azure-deployment.md).

Infrastructure apply replaces `ConnectionStrings__Hockey` with the Key Vault reference and populates its secret from GitHub using a secure Bicep parameter. App deployment does not rewrite the secret or app settings; it deploys the app and refreshes the reference. The vault grants the app Get; ARM deploys the secret using the existing deployment identity's Contributor role. No extra GitHub variables/secrets are required beyond updating an existing URI secret to Npgsql format. Vault names, secret name, and stage/prod environment selection are configured in `.bicepparam` files. Vault network restrictions are deferred; authenticated access policies still apply to the public HTTPS endpoint.
