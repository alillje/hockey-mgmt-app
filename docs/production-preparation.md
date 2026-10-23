# Temporary production-project evaluation

The environment named `prod` is currently a **second evaluation environment**, using the same shared-workspace application as staging. The owner approved this temporary scope; it is not a production launch. It has a separate Supabase project, Azure resource group, GitHub environment, and public database CA at `backend/Certificates/supabase-prod-root.crt`. `ASPNETCORE_ENVIRONMENT=Production` selects that file for verified PostgreSQL connections. The production CA currently has the same bytes as the staging CA, but the files remain environment-specific so rotation can be reviewed independently.

## GitHub `prod` environment

Deployment verified on 2026-10-23: [infrastructure apply](https://github.com/alillje/hockey-mgmt-app/actions/runs/39955266982) and [application release](https://github.com/alillje/hockey-mgmt-app/actions/runs/39955720497) succeeded. The release initialized PostgreSQL and passed database readiness, Auth configuration, anonymous API rejection, and React checks. Actual email sign-in, save/reload, and logout still need tester verification.

Create the `prod` environment and restrict it to `main`. Use the **same setting names as `stage`**, with production values. Enter all environment-specific values in `prod`; the shared Azure tenant and subscription IDs may come from repository variables if both environments use the same tenant and subscription.

| Name | Type | Production value |
| --- | --- | --- |
| `AZURE_RESOURCE_GROUP` | Variable | `rg-hockey-prod` |
| `AZURE_WEBAPP_NAME` | Variable | Globally unique name ending in `-prod`, for example `hockey-mgmt-app-prod` |
| `SUPABASE_PROJECT_REF` | Variable | The new production project's 20-letter reference |
| `SUPABASE_URL` | Variable | `https://<PROD PROJECT REF>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Variable | The new project's `sb_publishable_...` key |
| `SUPABASE_DATABASE_CONNECTION_STRING` | **Secret** | The new project's Npgsql session-pooler connection, below |
| `AZURE_CLIENT_ID` | Variable | Client ID of the separate production deployment identity |
| `AZURE_TENANT_ID` | Variable | Tenant containing that identity |
| `AZURE_SUBSCRIPTION_ID` | Variable | Subscription containing the production resource group |

The connection secret uses the production project's **Connect → Session pooler** host, username, and database password:

```text
Host=<PROD SESSION POOLER HOST>;Port=5432;Database=postgres;Username=postgres.<PROD PROJECT REF>;Password="<PROD DATABASE PASSWORD>";SSL Mode=VerifyFull
```

Keep the surrounding password quotes; double any literal `"` in the password. The host is copied from Supabase, not derived from its region. The certificate file is public and travels with the tested build; it does not require a GitHub secret or a `Root Certificate` connection parameter. Never copy the staging project URL, key, database password, or connection string into `prod`. [Supabase connection and SSL guidance](https://supabase.com/docs/guides/database/connecting-to-postgres)

## GitHub Actions sequence

After these values are entered and the code is pushed, wait for **01 Build and test (CI)** to succeed. Then run **Optional - Production-project infrastructure** from `main` with `operation=validate`. This checks the separate Supabase project, TLS settings, production certificate, and compiled private Bicep parameters. It does not contact Azure, create resources, connect to PostgreSQL, or publish the app.

For `operation=preview`, first create the Azure resource group `rg-hockey-prod` and a separate deployment managed identity (suggested name `id-hockey-prod-deploy`). Grant that identity Contributor on **only** `rg-hockey-prod`. Give it a GitHub OIDC federated credential for the `prod` environment. The subject follows the existing immutable repository format with `environment:prod` instead of `environment:stage`:

```text
repo:alillje@89385844/hockey-mgmt-app@1429378830:environment:prod
```

Then add `AZURE_CLIENT_ID` to the `prod` environment and ensure `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` are available in either that environment or repository variables. Run `operation=preview`. Preview signs into Azure and runs resource-group what-if with resource IDs only. Review the proposed `asp-hockey-prod` B1 plan, `hockey-mgmt-app-prod` web app, and `kv-hockey-prod` vault. Run the same workflow with `operation=apply` only after that preview is acceptable. Apply creates the resources, stores the production database secret in Key Vault, and enables public web access for this explicitly approved evaluation. The B1 plan starts incurring charges when created, even if the app is stopped. [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

After infrastructure apply succeeds, run **03 Deploy production-project evaluation** from `main`. It automatically selects the successful CI artifact for the current commit, applies pending EF migrations while the app is stopped, deploys the same application used by staging, refreshes the Key Vault reference, and checks `/api/health`, database readiness, Auth configuration, anonymous API rejection, and React. If a release fails after entering maintenance, the workflow stops the app. No database initializer or local Azure deployment command is needed. The new database starts empty.

To test actual email sign-in afterward, configure the **production Supabase project's** Auth Site URL as `https://hockey-mgmt-app-prod.azurewebsites.net` (or the actual `AZURE_WEBAPP_NAME` hostname), and allow `https://hockey-mgmt-app-prod.azurewebsites.net/auth/callback` as a redirect URL. Create or invite the test user in that Supabase project, request a magic link on the deployed site, save a drill, log out, and sign in again. The pipeline can validate public Auth configuration and anonymous access but cannot follow the user's email link.

## Before this becomes real production

- Implement and verify team/user authorization in the API and data model. The current shared-workspace exception is only for evaluation.
- Decide and verify backup/restore and recovery objectives. The current evaluation deferral is not a production recovery plan.
- Use separate, restricted runtime and migration database credentials instead of the staging POC's shared `postgres` account.
- Verify the final Auth account-creation/email policy, pricing, monitoring, and migration maintenance procedure.

Production-project infrastructure and app releases remain separate, manual GitHub Actions runs under the `prod` environment. Do not run `dotnet ef database update`, the staging database initializer, or staging app deployment against this project. GitHub environment branch restrictions and approval rules can provide an extra release control. [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
