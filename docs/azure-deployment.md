# GitHub Actions and staging Azure setup

Staging infrastructure deployment succeeded, as confirmed by the user after a successful preview. The GitHub `stage` environment and OIDC deployment connection are configured. The application has not been deployed: it remains an unauthenticated SQLite POC, with the hosted-app readiness tasks below still incomplete. Production is out of scope.

## Read this first: client ID, secret, and OIDC

**You need Azure client IDs. You do not need an Azure client secret. No GitHub secret is required for these deployment workflows.**

A managed identity is an Azure account for automation. Its client ID identifies which account GitHub wants to use. The client ID alone cannot sign in. Instead of a password/client secret, GitHub supplies a short-lived OIDC token. Azure checks the configured repository/environment trust and then grants that identity its assigned Azure permissions. [Microsoft federation guidance](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity)

The setup has three separate parts, similar to an ADO service connection:

| Part | Purpose | Where you configure it |
| --- | --- | --- |
| Managed identity and client ID | Select the Azure account used by a workflow | Azure Portal → Managed Identities |
| Federated credential | Let the GitHub `stage` environment obtain a temporary login for that identity | Managed identity → Federated credentials |
| Azure role assignment | Decide what the identity may change | Resource group/app → Access control (IAM) |

Both workflows use one GitHub environment, `stage`, and one Azure deployment identity, `id-hockey-stage-deploy`. Both read the same `AZURE_CLIENT_ID` variable.

**Where to obtain each value:**

| Value | Copy it from | Put it in GitHub as |
| --- | --- | --- |
| Deployment client ID | Managed Identities → `id-hockey-stage-deploy` → Overview → Client ID | `stage` environment variable `AZURE_CLIENT_ID` |
| Identity Principal/Object ID | The identity's Overview → Principal ID/Object ID | Used for Azure role assignments; do not substitute it for the client ID |
| Subscription ID | Subscriptions → your subscription → Overview | Repository variable `AZURE_SUBSCRIPTION_ID` |
| Tenant ID | Microsoft Entra ID → Overview → Tenant ID | Repository variable `AZURE_TENANT_ID` |
| SQL administrator group Object ID | Microsoft Entra ID → Groups → your SQL admin group → Overview → Object ID | `stage` environment variable `AZURE_SQL_ADMIN_OBJECT_ID` |
| Azure client secret | There is none to obtain in this setup | Do not create `AZURE_CLIENT_SECRET` |

If the deployment managed identity does not exist yet, create it using the portal steps below. Use **Managed Identities** for this guide; there is no need to create an app-registration client secret. [Microsoft managed identity portal guide](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/manage-user-assigned-managed-identities-azure-portal)

Some Microsoft examples store client/tenant/subscription IDs in GitHub's Secrets storage to mask them. That does not make those IDs Azure client secrets. Our templates deliberately read these non-secret identifiers from **Variables**, using `vars.NAME`.

## Portal setup: follow these steps in order

### 1. Create one GitHub environment

Open the repository → Settings → Environments → New environment. Name it exactly `stage`. Under deployment branches/tags, allow the branch `main`. Confirm your GitHub plan supports these environment controls before proceeding.

### 2. Create the Azure resource group

Azure Portal → Resource groups → Create. Choose your subscription, name the group `rg-hockey-stage`, and select Sweden Central to match the current stage parameter file. Copy the subscription ID and tenant ID using the table above.

### 3. Create one deployment identity and copy its client ID

Azure Portal → search for Managed Identities → Create. Name it `id-hockey-stage-deploy`, in `rg-hockey-stage`, using the same subscription and region.

Open its Overview page. Copy **Client ID**, then save it as `AZURE_CLIENT_ID` in the GitHub `stage` environment. Do not copy the resource ID or Principal/Object ID into this variable.

### 4. Configure GitHub trust on the identity

Open `id-hockey-stage-deploy` → Federated credentials → Add credential. Choose the scenario for GitHub Actions deploying Azure resources and enter:

| Field | Value |
| --- | --- |
| Organization/owner | `alillje` |
| Organization ID (numeric owner ID) | `89385844` |
| Repository | `hockey-mgmt-app` |
| Repository ID | `1429378830` |
| Entity type | Environment |
| Environment name | `stage` |
| Credential name | `github-stage-deploy` |
| Issuer | `https://token.actions.githubusercontent.com` |
| Audience | `api://AzureADTokenExchange` |

The subject must be exactly `repo:alillje@89385844/hockey-mgmt-app@1429378830:environment:stage`. This repository uses GitHub's immutable subject format. Its settings were checked through the GitHub API: `use_immutable_subject=true`, with prefix `repo:alillje@89385844/hockey-mgmt-app@1429378830`. The Organization ID field uses the numeric ID of the personal owner account, even though the field says Organization. These IDs are public identifiers, not secrets. Do not use the older name-only subject for this repository. [GitHub immutable OIDC subjects](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims) This trust configuration replaces the need for a stored deployment password. [Microsoft trust configuration](https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity)

### 5. Grant staging deployment permissions

Resource groups → `rg-hockey-stage` → Access control (IAM) → Add role assignment. Choose Contributor, choose Managed identity as the assignee type, and select `id-hockey-stage-deploy`. An administrator with role-assignment permissions must perform this step.

This one identity is used by both manual workflows. Contributor is scoped to the staging resource group, so it can provision staging resources and deploy the staging app. No separate app deployment identity or Website Contributor assignment is needed.

### 6. Choose the SQL administrator group

Microsoft Entra ID → Groups: use an existing suitable Security group, or create `Hockey Stage SQL Admins` with Assigned membership and add yourself. Copy its Object ID and display name into the SQL administrator variables listed below. Directory permissions may be needed to create the group.

### 7. Finish the GitHub variables

At repository Settings → Secrets and variables → Actions → Variables, add `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `AZURE_RESOURCE_GROUP`, and `AZURE_WEBAPP_NAME`.

At Settings → Environments → `stage` → Environment variables, add `AZURE_CLIENT_ID`, `AZURE_SQL_ADMIN_OBJECT_ID`, `AZURE_SQL_ADMIN_NAME`, `STAGE_PUBLIC_ACCESS_ENABLED=false`, and `STAGE_DEPLOYMENT_ENABLED=false`.

The complete variable table in the next sections explains each value. Leave both enablement flags false. Region and hosting/database SKUs are in `iac/parameters/stage.bicepparam`.

### 8. Register Azure providers and run only the preview

Under Azure Subscriptions → your subscription → Resource providers, confirm Microsoft.Web, Microsoft.Sql, Microsoft.KeyVault, and Microsoft.ManagedIdentity are registered. An administrator can register missing providers.

The prepared files must be committed and pushed before the workflows appear in GitHub. Then run Actions → Staging infrastructure → Run workflow → main → preview. Review the result and cost/tier availability before choosing apply. This verifies the connection and planned infrastructure without publishing the unfinished application.

The remaining sections document workflow details, CLI alternatives, and the later application deployment prerequisites.

## Workflows and their tasks

| Workflow | Trigger | Clearly separated tasks |
| --- | --- | --- |
| `CI` | Pull request, push to main, or manual run | Restore; check C# formatting; run API tests; install frontend dependencies; check formatting; run unit tests; build React; run browser tests; compile/lint Bicep and compile both environment parameter files; package a trusted main build |
| `Staging infrastructure` | Manual, from main | Prepare parameters; OIDC login; runtime check; preview Bicep changes; apply only if the operator chooses `apply` |
| `Deploy staging application` | Manual, from main, with a CI run ID | Check readiness; verify successful main CI provenance; download existing artifact; verify release metadata; OIDC login; check site access; deploy; smoke-test API and React |

No workflow automatically deploys on push. Successful push-to-main CI runs keep `stage-app` artifacts for 14 days. PR builds and manually dispatched CI runs cannot be selected for app deployment. Infrastructure, database preview, and app deployment share a concurrency group so they cannot change staging simultaneously. Actions are pinned to release commit SHAs, with version comments for readability.

CI needs no Azure credentials. Both manual deployment workflows use short-lived GitHub OIDC tokens for the same staging deployment identity. Microsoft supports federation using a user-assigned managed identity or an Entra application; this guide uses managed identities. [Azure OIDC guidance](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect)

## What I need from you

Nothing confidential is needed to review or test the templates locally. Before deploying, choose or provide these non-secret configuration values:

1. Azure subscription ID and tenant/directory ID.
2. Azure region, proposed `swedencentral`, subject to SKU/runtime/free-tier availability.
3. A staging resource group name, proposed `rg-hockey-stage`.
4. A globally unique staging app name, for example `hockey-mgmt-andreas-stage` if available.
5. An existing Entra security group for SQL administration: its object ID and display name. An object ID identifies the group; it is not an application/client ID.
6. The agreed monthly budget and approved hosting/database tier. The approved next apply uses Linux B1 for VNet integration and keeps the SQL free allowance. B1 incurs charges even when the app is stopped. See [the scripted setup and cost baseline](staging-database-automation.md).
7. GitHub repository visibility/account plan so environment controls can be confirmed.

You will also need an Azure administrator who can create the resource group, user-assigned identities, federated credentials, and initial role assignments. Creating/choosing the Entra SQL administrator group may need a directory administrator. You do not need to give the coding agent your Azure password, client secret, subscription Owner credentials, publish profile, or GitHub personal access token.

## Where configuration and secrets belong

Create one GitHub environment named `stage` under **Repository → Settings → Environments**. Both manual deployment workflows use it and select the same Azure deployment identity through `AZURE_CLIENT_ID`.

Restrict this environment to the main branch and use required reviewers when the repository plan supports them. GitHub environment secrets, variables, and approval controls differ by repository visibility and plan. If your plan does not support the intended environment controls, stop before configuring deployment and agree a supported alternative; do not silently remove the environment boundary. CI can still run independently. [GitHub environment availability](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

The following values are identifiers/configuration, not passwords. Store them as **Variables**, matching the workflows' `vars.NAME` references:

| Variable | GitHub location | Required value |
| --- | --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Repository Actions variable | Chosen Azure subscription UUID |
| `AZURE_TENANT_ID` | Repository Actions variable | Entra tenant UUID |
| `AZURE_RESOURCE_GROUP` | Repository Actions variable | Existing staging resource group |
| `AZURE_WEBAPP_NAME` | Repository Actions variable | Globally unique staging app name |
| `AZURE_CLIENT_ID` | `stage` environment variable | Client ID of `id-hockey-stage-deploy`, used by both manual workflows |
| `AZURE_SQL_ADMIN_OBJECT_ID` | `stage` environment variable | SQL administrator Entra group object UUID |
| `AZURE_SQL_ADMIN_NAME` | `stage` environment variable | That group's display name |
| `STAGE_PUBLIC_ACCESS_ENABLED` | `stage` environment variable | Leave `false` until all hosted-app readiness items are complete |
| `STAGE_DEPLOYMENT_ENABLED` | `stage` environment variable | Leave `false` until staging app deployment has been reviewed |

Region and SKUs are deliberately committed in `iac/parameters/stage.bicepparam`, rather than hidden in GitHub variables. Review changes to those cost-related values in a PR. `iac/parameters/prod.bicepparam` is a future production parameter file using distinct production variable names; no workflow deploys it.

Set repository variables at **Settings → Secrets and variables → Actions → Variables**. Set environment variables by opening the relevant environment's settings. A client ID does not authenticate anything by itself; OIDC federation and Azure permissions establish access.

For future genuine secrets:

| Secret | Storage |
| --- | --- |
| Google OAuth client secret | Staging Azure Key Vault; app uses a Key Vault reference/runtime managed identity |
| Later Microsoft login client secret | Staging Azure Key Vault |
| Data Protection wrapping key | Staging Azure Key Vault key; protected key ring remains in SQL |
| An unavoidable CI-only credential | GitHub **environment secret**, only in the environment that needs it |
| Azure deployment client secret / publish profile | Not needed: use OIDC |
| Runtime SQL password | Not needed: use managed identity/Entra authentication |

For an unavoidable GitHub secret, use **Settings → Environments → the intended environment → Environment secrets**, reference it as `secrets.NAME`, and never print it. These templates currently need no GitHub secrets. Secrets entered at repository scope would be available more broadly than intended; do not use that as the default. Never place secrets in chat, YAML, Bicep parameters, committed JSON, workflow inputs, frontend Vite variables, or `appsettings.json`.

## Azure CLI alternative to the portal setup

The following commands are instructions for an administrator, not commands already executed. They create the deployment trust, not the application resources. Run them only after agreeing the region and cost approach.

First sign in locally and select the intended subscription:

```bash
az login
az account set --subscription '<subscription-id>'
az account show --query '{subscription:id,tenant:tenantId}'
```

Create the staging group and one deployment identity:

```bash
az group create --name rg-hockey-stage --location swedencentral
az identity create --resource-group rg-hockey-stage --name id-hockey-stage-deploy
az identity show --resource-group rg-hockey-stage --name id-hockey-stage-deploy --query '{clientId:clientId,principalId:principalId}'
```

Copy `clientId` into the GitHub `stage` environment variable `AZURE_CLIENT_ID`. Use `principalId` only when assigning Azure roles. The future application's runtime identity is created automatically by Bicep; it is not another deployment connection you need to create manually.

Configure the one deployment identity's federation:

```bash
az identity federated-credential create \
  --resource-group rg-hockey-stage \
  --identity-name id-hockey-stage-deploy \
  --name github-stage-deploy \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:alillje@89385844/hockey-mgmt-app@1429378830:environment:stage \
  --audiences api://AzureADTokenExchange
```

The subject must exactly identify this repository and the `stage` environment. Both workflows use the same trust configuration. Rename it deliberately if the repository changes.

An administrator assigns:

| Identity | Azure scope and permission |
| --- | --- |
| Staging deployment (`id-hockey-stage-deploy`) | Contributor on `rg-hockey-stage`, used for IaC and app deployment; no subscription-wide Owner or application database access |
| Web app runtime | Later, a least-privilege contained SQL user in `hockey-stage`, Key Vault Secrets User, and the required wrap/unwrap key permissions on its own vault/key |
| Database migration runner | Existing staging deployment identity, authorized once with the custom schema/data migration role inside hockey-stage; runtime identity remains limited to application tables |

Contributor is broad inside the staging group. It can change staging resources; it is intentionally confined to staging. Both trusted workflows share the same staging identity and permissions; they remain separate manual workflows. Creating role assignments is a bootstrap administrator task. For example, use the deployment identity's principal/object ID, not its client ID:

```bash
az role assignment create \
  --assignee-object-id '<deployment-identity-principal-id>' \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope '/subscriptions/<subscription-id>/resourceGroups/rg-hockey-stage'
```

The Bicep templates do not grant themselves additional RBAC privileges. SQL data permissions must be granted inside SQL by the SQL administrator; Azure Contributor does not supply them.

Register the required Azure resource providers if they are not already registered: `Microsoft.Web`, `Microsoft.Sql`, `Microsoft.KeyVault`, `Microsoft.ManagedIdentity`, and `Microsoft.Network`. Run `bash scripts/azure/register-stage-providers.sh` as a subscription administrator to register them without portal setup. An administrator can register them before the first deployment; the group-scoped workflow identity may not have subscription-level registration permissions.

## Infrastructure preview and apply

The shared template is `iac/main.bicep`, with small web/database/vault modules under `iac/modules`. `iac/parameters/stage.bicepparam` selects staging and is the only parameter file used by the deployment workflow. The future `iac/parameters/prod.bicepparam` has no deployment hook. CI compiles both files using dummy non-secret identifiers, without creating resources.

The staging template invocation targets an existing resource group and creates:

- One approved B1 Linux hosting plan and .NET 10 web app with VNet integration.
- One VNet and delegated app subnet with a Microsoft.Sql service endpoint and SQL subnet access rule.
- One SQL logical server with Entra-only authentication and one Free or Basic database.
- One standard RBAC-enabled Key Vault with soft delete and purge protection.
- A runtime managed identity for the web app; no provider credentials, stored secrets, or SQL grants.

The workflow compiles the stage `.bicepparam` file to an ignored JSON parameter file, then validates that its environment is exactly stage and its identifiers are populated. Public web access is disabled by default. FTP and SCM basic authentication are disabled. SQL authorizes the app subnet, with no permanent app IP rules and no broad Allow Azure services rule. Database administration workflows temporarily allow only their caller IP, then remove that rule. Key Vault is accessible only to explicitly authorized identities despite having a public endpoint. Provider eligibility, quotas, and availability are checked by Azure during validation/deployment; local compilation cannot prove them.

Run **Actions → Staging infrastructure → Run workflow → main → preview**. Review the resource names, SKUs, free-tier settings, and expected changes. A preview authenticates and reads Azure but does not provision the described resources. When approved, rerun with `apply`; it previews again and performs an incremental deployment. Applying infrastructure can incur charges, even while public app access stays disabled.

The SQL free tier is a specific free-limit configuration and pauses at the monthly limit. It is not interchangeable with an ordinary billable serverless database. The template explicitly sets `useFreeLimit` and `freeLimitExhaustionBehavior: AutoPause`. Confirm eligibility before applying. Do not change an existing database between Free and Basic casually: review data preservation, service constraints, and the exact Azure what-if first. Never recreate a database merely to make a deployment succeed.

After the first apply, record the deployment outputs: app name/URL, runtime identity object ID, SQL server/name, and vault name. The administrator should apply a database `CanNotDelete` resource lock after provisioning; this remains outside the Contributor-scoped template because lock administration requires additional authorization. Verify a backup before removing the lock for any planned resource deletion.

The application-settings module merges SQL provider, managed-identity connection string, and actual app hostname into App Service settings while preserving unrelated keys. No database password is stored. Future OAuth secrets should use Key Vault references. See [scripted staging database preparation](staging-database-automation.md) for one-time SQL authorization, read-only migration preview, and maintenance releases. Nothing in this update has been applied to Azure.

## App prerequisites and later deployment

`iac/stage/application-readiness.json` tracks deployment prerequisites. Local SQL provider/migration and combined publishing implementation is described in [database modes and publishing](database-and-publishing.md). Real SQL execution and Azure connectivity remain to be verified:

1. Implement authentication and a staging tester allowlist.
2. Implement team authorization.
3. Verify the prepared SQL Server provider and reviewed migration SQL against a real database. SQL Server startup skips SQLite initialization and all schema changes.
4. Review combined React/ASP.NET Core publishing and SPA fallback/API routing tests.
5. Configure runtime SQL/Key Vault permissions, narrow SQL firewall rules, provider registrations/callbacks, durable cookie keys, and environment configuration.
6. Verify a backup/restore procedure for the actual selected database tier.

Complete these tasks in code and review the readiness file in the same PR. Setting flags alone does not implement or prove readiness. Tests cover SQLite, hosted routing/configuration, and offline SQL migration generation. The real SQL test requires a disposable SQL Server (provided in CI) and is skipped locally without one. These checks do not prove Azure managed-identity access or authentication/team isolation.

When ready:

1. Merge the implementation and let CI finish successfully. Record its run ID.
2. Rehearse controlled SQL migrations before deployment through a separately authorized SQL administrator/migration operator. The generated SQL travels beside app.zip; Preview staging database shows the SQL, while Deploy staging application runs the same tested EF bundle during a maintenance window after one-time administrator bootstrap. It is never applied automatically on push.
3. Configure the future Google secrets directly in Key Vault and App Service Key Vault references. Verify the runtime identity's database/vault access and VNet/subnet connectivity. Never grant the runtime schema-owner permissions.
4. Set `STAGE_PUBLIC_ACCESS_ENABLED=true` in `stage`, preview and apply the deliberate access change. This parameter is rejected while tracked readiness items remain incomplete.
5. Set `STAGE_DEPLOYMENT_ENABLED=true` in `stage`.
6. Run **Deploy staging application**, from main, with the successful push-to-main CI run ID.

The deployment checks both current readiness and the readiness report shipped with the selected artifact. It verifies that the run belongs to this repository's `CI` workflow, succeeded, and was triggered by a main push; artifact metadata must match its commit/run ID. It deploys the original ZIP rather than rebuilding. Downloaded packages cannot be used after GitHub artifact retention expires; create a fresh trusted CI run via a new main commit when needed.

Smoke checks validate API liveness, database-backed readiness, and the React entry page. They do not yet test real external-provider login or team isolation in Azure. Add those checks with the corresponding application features. Keep test logins private and never automate around Google's anti-bot protections.

No production resources, production workflow, publish profile, or automatic database reset is included. Application deployment remains manual, including after hosted readiness is complete. A successful CI run only creates an artifact; an operator must explicitly run the staging deployment workflow and select the trusted CI run ID.

## Runtime check troubleshooting

The runtime check and infrastructure preview are separate workflow steps. The check reads Azure CLI's JSON response, supporting both legacy runtime strings and newer records with a `config` field. Runtime identifiers may use `:` or `|`. An exact-line TSV grep is unsuitable because structured runtime records contain additional columns.

If .NET 10 is not listed, the check reports the available .NET identifiers and stops before what-if. Read the generated `artifacts/azure/linux-runtimes.json` during diagnosis. An Azure CLI command/authentication failure still stops the job rather than being treated as runtime availability.

## Template verification

Local preparation includes Bicep compilation/linting, workflow linting with actionlint, shell syntax checks, parameter/readiness checks, and the existing application checks. GitHub-hosted CI and the infrastructure preview passed; the user subsequently confirmed that infrastructure apply succeeded. Hosted application deployment, database connectivity/migrations, real login, and recovery remain unverified.

Bicep is pinned to `v0.48.1`. For manual local validation with Azure CLI installed:

```bash
az bicep install --version v0.48.1
az bicep build --file iac/main.bicep --outfile /tmp/hockey-stage.json
az bicep lint --file iac/main.bicep
```

Keep compiler/action release pins reviewed and updated. See [the broader teams/auth/hosting plan](teams-auth-hosting-plan.md) for product behavior, tenancy, recovery, and the deferred production rollout.
