# Temporary production-project evaluation

Current source refactors visibility sharing into independent organisation/team copies. Review the [data migration and membership changes](independent-copies.md) before a separately authorised release; existing hosted environments are not migrated by preparing this change.

The environment named `prod` is currently a **second evaluation environment**, using the same shared-workspace application as staging. The owner approved this temporary scope; it is not a production launch. It has a separate Supabase project, Azure resource group, GitHub environment, and public database CA at `backend/Certificates/supabase-prod-root.crt`. `ASPNETCORE_ENVIRONMENT=Production` selects that file for verified PostgreSQL connections. The production CA currently has the same bytes as the staging CA, but the files remain environment-specific so rotation can be reviewed independently.

## GitHub `prod` environment

Deployment verified on 2026-10-23: [infrastructure apply](https://github.com/alillje/hockey-mgmt-app/actions/runs/39955266982) and [application release](https://github.com/alillje/hockey-mgmt-app/actions/runs/39955720497) succeeded. The release initialized PostgreSQL and passed database readiness, Auth configuration, anonymous API rejection, and React checks. Actual email sign-in, save/reload, and logout still need tester verification.

## Custom apex domain on Azure App Service

The production app is also configured with a custom root/apex hostname. These steps use placeholders so DNS addresses, ownership verification tokens, and other environment-specific values are not recorded here.

1. In the production App Service's **Custom domains** page, copy the listed IP address value(s) and **Custom Domain Verification ID**.
2. At the DNS provider, create an A record for the apex (`@`) for each IP shown by App Service, and a TXT record named `asuid` containing the verification ID. For Cloudflare, keep the A records **DNS only** (gray cloud) when using an App Service managed certificate. Do not publish the actual IPs or verification ID in repository files.
3. In App Service, add the apex hostname using **All other domain services**, validate the A/TXT records, add the hostname, then create an **App Service Managed Certificate** and bind it with **SNI SSL**. Confirm the hostname shows **Secured**.
4. Configure the hostname in `iac/parameters/prod.bicepparam` as `customDomainHostName` (hostname only, without scheme). The Bicep app-settings module sets `AllowedHosts` to both the Azure default hostname and the custom hostname. Apply changes through **Optional - Production-project infrastructure** with `operation=apply`; this updates App Service settings and restarts the app, but does not deploy a new application artifact.
5. If ASP.NET Core returns **400 Bad Request – Invalid Hostname** while Azure shows the custom hostname as secured, check `AllowedHosts`. It must include the custom hostname as well as the Azure default hostname. A successful TLS binding alone does not add a hostname to the application's host-filter allowlist.
6. If using Supabase magic-link authentication on the custom hostname, set the Supabase Auth Site URL to that hostname and add its `/auth/callback` URL to the allowed Redirect URLs. The `www` hostname is optional; it requires its own DNS/hostname configuration if you want to support it.

Keep the App Service managed-certificate A records DNS-only in Cloudflare. Email-related DNS (MX, SPF, DKIM, and DMARC) is separate and is only needed if the domain will receive or send mail directly; it is not required to serve the web app.

Create the `prod` environment and restrict it to `main`. Use the **same setting names as `stage`**, with production values. Enter all environment-specific values in `prod`; the shared Azure tenant and subscription IDs may come from repository variables if both environments use the same tenant and subscription.

| Name | Type | Production value |
| --- | --- | --- |
| `AZURE_RESOURCE_GROUP` | Variable | `rg-hockey-prod` |
| `AZURE_WEBAPP_NAME` | Variable | Globally unique name ending in `-prod`, for example `hockey-mgmt-app-prod` |
| `LEGACY_WORKSPACE_ADMIN_USER_ID` | Optional variable | Existing Auth user UUID authorised to adopt preserved pre-team data; empty for a new club |
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

To test actual email sign-in afterward, configure the **production Supabase project's** Auth Site URL and `/auth/callback` Redirect URL for the hostname you intend to use (the custom hostname or the Azure default hostname). Create or invite the test user in that Supabase project, request a magic link on the deployed site, save a drill, log out, and sign in again. The pipeline can validate public Auth configuration and anonymous access but cannot follow the user's email link.

## Before this becomes real production

- Implement and verify team/user authorization in the API and data model. The current shared-workspace exception is only for evaluation.
- Decide and verify backup/restore and recovery objectives. The current evaluation deferral is not a production recovery plan.
- Use separate, restricted runtime and migration database credentials instead of the staging POC's shared `postgres` account.
- Verify the final Auth account-creation/email policy, pricing, monitoring, and migration maintenance procedure.

Production-project infrastructure and app releases remain separate, manual GitHub Actions runs under the `prod` environment. Do not run `dotnet ef database update`, the staging database initializer, or staging app deployment against this project. GitHub environment branch restrictions and approval rules can provide an extra release control. [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
