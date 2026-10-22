# GitHub Actions and Azure application hosting

Azure hosts the combined .NET 10 API and React frontend. **Supabase PostgreSQL replaces Azure SQL.** Supabase Auth, teams, invitations, and public hosting remain deferred. The previously provisioned Azure SQL resources are still live until the owner removes them; the new templates do not delete resources.

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

The existing App Service system-assigned identity remains to avoid unnecessary identity changes. It does not authenticate PostgreSQL; the Supabase runtime role does. No SQL administrator group, VNet integration, SQL service endpoint, Key Vault, or Azure SQL server is provisioned by the new templates. Keep Microsoft.Web and Microsoft.ManagedIdentity provider registration for Azure hosting/deployment identity. There is no need to unregister retired resource providers.

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
| `SUPABASE_PROJECT_REF` | stage **secret** | Staging project reference; stored as a secret by user preference |
| `SUPABASE_DATABASE_CONNECTION_STRING` | stage **secret** | Standard Supabase project connection used by runtime and migrations |

Remove **AZURE_SQL_ADMIN_OBJECT_ID** and **AZURE_SQL_ADMIN_NAME**. Remove unused **AZURE_PROD_SQL_ADMIN_OBJECT_ID** and **AZURE_PROD_SQL_ADMIN_NAME** if previously created. Keep future `AZURE_PROD_WEBAPP_NAME` only if you want to retain its proposed name; no production workflow reads it yet.

See [Supabase database setup](supabase-database.md) for the standard connection format, schemas, and manual Azure resource retirement. No Supabase Auth keys, service-role key, API token, Google credentials, or Azure client secret are required for this database-only phase. Do not paste passwords in chat. Credentials must never enter Bicep parameters, committed JSON, artifacts, logs, or React/Vite variables.

Bicep retains separate `iac/parameters/stage.bicepparam` and future `prod.bicepparam`. Hosting region and B1 tier remain explicit reviewed parameters. B1 incurs charges while the app is stopped; it is retained here rather than silently changing compute capacity. Supabase database charges are separate.

## Workflow tasks

| Workflow | Trigger | Tasks |
| --- | --- | --- |
| CI | PR, main push, or manual | Formatting, SQLite/PostgreSQL API tests, frontend tests/build/browser checks, publish, test Linux EF bundle twice, validate Bicep, package trusted main builds |
| Staging infrastructure | Manual main preview/apply | Compile stage parameters, validate them, Azure OIDC login, verify .NET 10 runtime, preview, optionally apply |
| Preview staging database | Manual main + CI run ID | Verify trusted artifact/current commit, display PostgreSQL migration SQL and checksum; no Azure/SQL connection |
| Deploy staging application | Manual main + CI run ID | Readiness/provenance checks, validate the Supabase connection secret, stop app, migrate, set runtime connection, deploy/start app, smoke checks |

There is no automatic deployment on push. All staging workflows serialize through the same concurrency group. PR and manually dispatched CI runs cannot supply application release artifacts. Trusted main artifacts are kept for 14 days and identify their commit/run. The package readiness report and current source readiness must both pass. Actions are pinned to reviewed commit SHAs.

CI uses a disposable PostgreSQL service; it needs neither Supabase secrets nor Azure credentials. The PostgreSQL preview workflow also needs no database secrets. Only manual app deployment reads the stage database secret. It writes the runtime connection to App Service settings using a protected temporary file and deletes that file afterward. The same connection is privately converted to Npgsql format and passed to the bundle through its process environment and to the app through App Service settings.

## Apply the infrastructure cleanup

After reviewing and pushing this change, run **Staging infrastructure → main → preview**. Review preservation of web app/hosting names and the switch to `Database__Provider=PostgreSql`, then explicitly choose **apply**. This does not deploy the application, set its database password, create Supabase resources, or delete obsolete Azure resources.

App settings are read in the parent deployment and passed as a secure object into the settings module before merging. This avoids a circular dependency and preserves unrelated settings, including the externally configured database connection. Consequently an old Azure SQL connection is preserved until the new deployment replaces it; do not start an old app against mismatched provider/settings.

Incremental Bicep removal does not delete old SQL/network/vault resources. Follow [the manual retirement order](supabase-database.md#remove-obsolete-azure-resources-manually). Confirm/detach retained Web App VNet integration before deleting its subnet/VNet. Keep the deployment identity, resource group, app, and hosting plan.

If Azure apply fails, rerun preview before retrying; Azure may have applied only part of the change. No resource deletion or live apply was performed by this repository cleanup.

## Before application deployment

`iac/stage/application-readiness.json` still tracks authentication/tester access, team authorization, PostgreSQL/live migration verification, React serving, runtime permissions, and backup/restore. This database-only change does not implement auth or waive those gates. Changing environment flags alone is insufficient. Revisit auth or the separately scoped temporary test mode when requested.

Once the remaining scope is explicitly approved and verified:

1. Configure the staging Supabase project, stage project-reference secret, and database connection secret.
2. Merge/push reviewed code and let CI create a successful trusted main artifact.
3. Use **Preview staging database** to review that artifact's SQL/checksum.
4. Review readiness changes in source, including actual Supabase connectivity, runtime grants, and recovery evidence; do not mark unverified work complete.
5. Deliberately enable public access through the stage variable and reviewed infrastructure preview/apply.
6. Set `STAGE_DEPLOYMENT_ENABLED=true` and manually run **Deploy staging application** with the successful current-main CI run ID.
7. Verify persistence through restarts/redeploys. Health/readiness/React checks do not establish user/team isolation.

Releases stop the app for schema updates. Failure after entering maintenance leaves it stopped; no automatic Down migration, restore, or restart of old incompatible code runs. Protect the database secret and trusted release branch. The first reviewed bundle creates the application schemas/tables; no custom role setup is required for this POC.

## Local verification

```bash
source scripts/toolchain.sh
python3 -m unittest discover --start-directory scripts/azure/tests
az bicep build --file iac/main.bicep
az bicep lint --file iac/main.bicep
```

The project-local pinned compiler may also be used without Azure login. Compile both parameter files with validation-only web-app names, as CI does. Compilation does not prove a live Azure deployment, Supabase connectivity, auth, or recovery. See [database modes and publishing](database-and-publishing.md) for application checks.
