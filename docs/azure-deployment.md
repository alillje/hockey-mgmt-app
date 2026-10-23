# GitHub Actions and Azure application hosting

Azure hosts the combined .NET 10 API and React frontend. **Supabase PostgreSQL replaces Azure SQL.** Email magic-link Auth works locally; staging Auth configuration is prepared, while teams, invitations, and public hosting remain gated. The owner reported removing the old SQL/network/vault resources. Current IaC restores Key Vault for runtime secret storage; it does not restore Azure SQL or SQL networking.

## Existing Azure connection: keep it

Keep one GitHub environment named **stage**, one Azure resource group **rg-hockey-stage**, one B1 hosting plan **asp-hockey-stage**, web app **hockey-mgmt-app-stage**, and deployment identity **id-hockey-stage-deploy**. Production remains unconnected.

The same identity deploys infrastructure and the application using short-lived GitHub OIDC tokens. Keep its Contributor assignment scoped to `rg-hockey-stage`. **No Azure client secret or publish profile is needed.** The client ID identifies the managed identity; federation and its Azure role assignment authenticate and authorize the workflow. This Azure connection is independent of Supabase database credentials. [Azure OIDC guidance](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)

If recreating the identity, use Azure Portal → **Managed Identities**, then add a federated credential with these verified repository details:

| Field | Value |
| --- | --- |
| Organization/owner | `alillje` |
| Organization ID | `89385844` |
| Repository | `hockey-mgmt-app` |
| Repository ID | `1429378830` |
| Entity type / environment | Environment / `stage` |
| Credential name | `github-stage-deploy` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Audience | `api://AzureADTokenExchange` |
| Subject | `repo:alillje@89385844/hockey-mgmt-app@1429378830:environment:stage` |

This repository uses GitHub's immutable OIDC subject format. Do not replace it with the older name-only subject. The numeric Organization ID is the personal owner's public numeric ID. Copy the identity's **Client ID**, not Principal/Object ID, into `AZURE_CLIENT_ID`. [GitHub immutable subjects](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)

App Service's system-assigned identity resolves the database Key Vault reference. The existing deployment identity submits a secure parameter to Azure Resource Manager when applying Bicep; Bicep creates or updates the vault secret. Migrations use the GitHub secret directly. The vault's access policy grants the app **Get** on secrets. The deployment identity uses its existing resource-group Contributor assignment for the ARM deployment; it does not need a Key Vault data-plane Set/Get policy or a new RBAC assignment. [Key Vault reference permissions](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references), [secure Bicep parameters](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/scenarios-secrets)

Keep Microsoft.Web, Microsoft.KeyVault, and Microsoft.ManagedIdentity provider registration. No SQL administrator group, VNet integration, SQL service endpoint, private endpoint, or Azure SQL server is provisioned. Network restrictions are deferred. The vault's public HTTPS endpoint still requires Entra authentication and the configured policies; no anonymous secret access is enabled.

## GitHub variables and secrets

Use **Settings → Secrets and variables → Actions → Variables** for repository variables. Use **Settings → Environments → stage** for environment variables and secrets. Keep the existing `stage` environment restricted to main, with review controls where supported by your GitHub plan. Do not create a second staging environment.

| Name | Storage | Purpose |
| --- | --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Repository variable | Existing hosting subscription |
| `AZURE_TENANT_ID` | Repository variable | Existing Entra tenant |
| `AZURE_RESOURCE_GROUP` | Existing repository or stage variable | `rg-hockey-stage`; environment value wins if both exist |
| `AZURE_WEBAPP_NAME` | Existing repository or stage variable | `hockey-mgmt-app-stage` |
| `AZURE_CLIENT_ID` | stage variable | Client ID of `id-hockey-stage-deploy` |
| `STAGE_PUBLIC_ACCESS_ENABLED` | stage variable | Keep `false` until public staging scope/readiness is reviewed |
| `STAGE_DEPLOYMENT_ENABLED` | stage variable | Keep `false` until app deployment scope/readiness is reviewed |
| `SUPABASE_PROJECT_REF` | stage **variable** | Staging project reference used to validate the connection target |
| `SUPABASE_URL` | stage **variable** | Public project URL for the staging sign-in screen and API token validation |
| `SUPABASE_PUBLISHABLE_KEY` | stage **variable** | Browser-visible publishable key for staging sign-in |
| `SUPABASE_DATABASE_CONNECTION_STRING` | stage **secret** | Standard Supabase project connection used by runtime and migrations |

The infrastructure workflow checks that `SUPABASE_URL` matches `SUPABASE_PROJECT_REF`. The database connection belongs in **Secrets** only; the duplicate GitHub Variable was removed by the owner.

Remove **AZURE_SQL_ADMIN_OBJECT_ID** and **AZURE_SQL_ADMIN_NAME**. Remove unused **AZURE_PROD_SQL_ADMIN_OBJECT_ID** and **AZURE_PROD_SQL_ADMIN_NAME** if previously created. Keep future `AZURE_PROD_WEBAPP_NAME` only if you want to retain its proposed name; no production workflow reads it yet.

See [Supabase database setup](supabase-database.md) for the required Npgsql connection format, schemas, and manual Azure resource retirement. The Auth URL, publishable key, and user IDs are public configuration; no service-role key, Supabase API token, Google credential, or Azure client secret is required. Do not paste passwords in chat. The connection enters a **secure** Bicep parameter during a manual infrastructure run; it must not enter committed files, uploaded artifacts, workflow inputs, logs, or React/Vite variables.

Bicep retains separate `iac/parameters/stage.bicepparam` and future `prod.bicepparam`. Hosting region and B1 tier remain explicit reviewed parameters. B1 incurs charges while the app is stopped; it is retained here rather than silently changing compute capacity. Supabase database charges are separate.

## Workflow tasks

| Workflow | Trigger | Tasks |
| --- | --- | --- |
| CI | PR, main push, or manual | Formatting, SQLite/PostgreSQL API tests, frontend tests/build/browser checks, publish, test Linux EF bundle twice, validate Bicep, package trusted main builds |
| Staging infrastructure | Manual main preview/apply | Compile stage parameters, validate them, Azure OIDC login, verify .NET 10 runtime, preview, optionally apply and populate the vault secret |
| Preview staging database | Manual main + CI run ID | Verify trusted artifact/current commit, display PostgreSQL migration SQL and checksum; no Azure/SQL connection |
| Initialize staging database | Manual main + CI run ID | Require stopped/private web app, apply the reviewed migration bundle to Supabase, and confirm repeatability; no app deployment |
| Deploy staging application | Manual main + CI run ID | Readiness/provenance checks, validate connection, stop app, migrate from GitHub, deploy/start app, refresh vault references, smoke checks |

There is no automatic deployment on push. All staging workflows serialize through the same concurrency group. PR and manually dispatched CI runs cannot supply application release artifacts. Trusted main artifacts are kept for 14 days and identify their commit/run. The package readiness report and current source readiness must both pass. Actions are pinned to reviewed commit SHAs.

CI uses a disposable PostgreSQL service; it needs neither Supabase secrets nor Azure credentials. Database preview also needs no database secrets. Manual infrastructure preview/apply compile the existing GitHub connection into a private parameter file under the runner's temporary directory. The directory is private, the file is removed on completion or failure, and the workflow uses resource-ID-only what-if output so the secret is not printed. ARM treats the connection as a secure parameter and does not show its value in deployment history. Bicep writes it to Key Vault only on **apply**. App deployment passes the same GitHub secret to the migration bundle through its process environment; it neither reads nor updates the vault.

## Environment-specific settings in Bicep

The stage parameter file defines `keyVaultName = 'kv-hockey-stage'` and `databaseSecretName = 'supabase-db-connection'`. Future production uses `kv-hockey-prod`; no production workflow is connected. Names have no random suffix. Key Vault names must be globally available; choose another simple readable name in the appropriate parameter file if Azure reports a conflict. A soft-deleted vault can reserve its name; recover it intentionally rather than purging it automatically.

`iac/modules/application-settings.bicep` owns `Database__Provider`, `AllowedHosts`, `ASPNETCORE_ENVIRONMENT` (Staging/Production), `ConnectionStrings__Hockey`, `Auth__Mode`, `Auth__SupabaseUrl`, and `Auth__SupabasePublishableKey`. The stage infrastructure workflow reads the public Auth values from GitHub `stage` variables and compiles them into the Bicep parameters. The connection setting is a versionless `@Microsoft.KeyVault(SecretUri=https://<environment-vault>.vault.azure.net/secrets/supabase-db-connection)` reference. Bicep stores the supplied Npgsql connection unchanged in the vault secret. The workflow no longer calls `az webapp config appsettings set`. Unrelated settings remain preserved using the secure parent-to-module merge, avoiding the earlier circular dependency.

The vault is Standard, with soft delete, 90-day retention, and purge protection. It uses a public endpoint without VNet/firewall restrictions in this phase. Bicep owns its secret and access policy. App release explicitly refreshes references before smoke checks, avoiding the normal reference-cache delay after an infrastructure rotation. [Key Vault reference caching](https://learn.microsoft.com/en-us/azure/app-service/app-service-key-vault-references)

## Apply the infrastructure cleanup

After reviewing and pushing this change, run **Staging infrastructure → main → preview**, review the vault name, app Get policy, and app settings, then explicitly choose **apply**. The apply creates or updates the vault and its database secret through Bicep, then configures the app reference. Keep the app stopped until a reviewed release; an older deployed app might not use the new PostgreSQL settings correctly. If apply fails, inspect the deployment operations and rerun preview before retrying.

Keep `SUPABASE_PROJECT_REF` in the stage environment's Variables and `SUPABASE_DATABASE_CONNECTION_STRING` in its Secrets. Set the connection secret to the documented **Npgsql** format before preview/apply; an existing Supabase dashboard URI must be replaced. The deployment identity retains its existing Azure role, and the app's system-assigned Principal ID is resolved by Bicep. No additional identity-ID variable is needed.

Infrastructure apply does not deploy the application, create Supabase resources, or migrate its database. Incremental Bicep does not delete old resources. Keep the new `kv-hockey-stage` vault and existing deployment identity, resource group, app, and hosting plan. If the GitHub database secret changes, run infrastructure **apply** to update the vault before a new app release; otherwise migrations could use a different connection from the running app. No live provisioning was performed by this code change.

## Before application deployment

`iac/stage/application-readiness.json` tracks Supabase authentication, reviewed PostgreSQL migrations, React serving, runtime database checks, and backup/restore. [Staging readiness evidence](staging-readiness.md) records what has been verified and what remains. The owner approved a shared workspace without team authorization and deferred backup/restore rehearsal for a limited staging POC on 2026-10-23; those exceptions do not apply to production. Any user with a valid session from this Supabase project can access the shared application data. The app's magic-link request does not create new users (`shouldCreateUser: false`); Supabase's project-wide signup setting and Auth user records determine who can obtain a session. The deploy workflow must prove live database readiness and Auth configuration before leaving the app running.

Once the remaining scope is explicitly approved and verified:

1. Configure the staging Supabase project, stage project-reference variable, and Npgsql database connection secret.
2. Merge/push reviewed code and let CI create a successful trusted main artifact.
3. Preview and apply **Staging infrastructure** so the Key Vault value matches that GitHub secret. Use **Preview staging database** to review the artifact's SQL/checksum.
4. With the web app stopped and public access disabled, run **Initialize staging database** with that same current-main CI run ID. This applies the already reviewed EF bundle without deploying the app and verifies it can run twice. The bundle creates only empty application tables.
5. For this limited staging POC, review the recorded backup/restore deferral and the workflow's live runtime database readiness check. Do not mark either as already verified.
6. Deliberately enable public access through `STAGE_PUBLIC_ACCESS_ENABLED=true` and reviewed infrastructure preview/apply.
7. Set `STAGE_DEPLOYMENT_ENABLED=true` and trigger the **Deploy staging application** GitHub Actions workflow with the successful CI run ID for the newly reviewed readiness commit. The pipeline deploys the app from its tested artifact, then checks database reads, Auth configuration, anonymous access rejection, and React; failure after maintenance stops the app. Do not deploy from a developer machine.
8. In a browser, verify a real staging email magic link, saving a drill, and logging out. Confirm persistence through a restart or later redeploy. Backup/restore rehearsal remains due before relying on staging data or preparing production.

Releases stop the app for schema updates. Failure after entering maintenance leaves it stopped; no automatic Down migration, restore, or restart of old incompatible code runs. Protect the database secret and trusted release branch. The first reviewed bundle creates the application schemas/tables; no custom role setup is required for this POC.

## Local verification

```bash
source scripts/toolchain.sh
python3 -m unittest discover --start-directory scripts/azure/tests
az bicep build --file iac/main.bicep
az bicep lint --file iac/main.bicep
```

The project-local pinned compiler may also be used without Azure login. Compile both parameter files with validation-only web-app names, as CI does. Compilation does not prove a live Azure deployment, Supabase connectivity, auth, or recovery. See [database modes and publishing](database-and-publishing.md) for application checks.
