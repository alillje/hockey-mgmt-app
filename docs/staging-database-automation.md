# Staging networking, database setup, and maintenance releases

The approved baseline is Linux B1 with VNet integration and a Microsoft.Sql service endpoint. SQL authorizes the app subnet instead of an App Service public-IP list. SQL retains its public endpoint; service endpoints are not Private Link. Managed identity supplies authentication.

These changes are prepared locally, not applied to Azure. App deployment/public access remain behind the existing readiness gates; the separately requested temporary unauthenticated test mode is not enabled by this work. Production remains unconnected.

## Cost and infrastructure

The next infrastructure apply upgrades the existing plan from F1 to B1 in place, adds `vnet-hockey-stage` in the existing resource group/region, and creates the delegated `app-integration` subnet (`10.60.0.0/26`, within `10.60.0.0/16`). Check address compatibility before connecting other networks later.

The checked Sweden Central Linux B1 retail rate on 2026-10-22 was 0.1794 SEK/hour, approximately 131 SEK at 730 hours/month before tax. Hosting charges continue while the app is stopped. VNet and service endpoints add no base charge. No NAT/VPN Gateway, private endpoint, or private DNS zone is provisioned. SQL's free allowance and pause-at-limit behavior are preserved. Other service/GitHub allowances still apply. [App Service pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/), [service endpoints](https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-service-endpoints-overview).

IaC preserves existing web/database names and data. It merges SQL provider, passwordless managed-identity connection string, and actual hostname settings while preserving unrelated app settings. Future secrets should use Key Vault references.

## One-time setup

Run as an existing Entra SQL administrator, a member of `Hockey Stage SQL Admins`. Tools: Azure CLI, GitHub CLI, .NET 10, Python 3, and curl. Sign in using `az login` and `gh auth login`. Scripts read the existing GitHub `stage` variables when they are not set locally; no new identity or client secret is needed.

1. Register subscription providers as a subscription administrator:

   ```bash
   source scripts/toolchain.sh
   bash scripts/azure/register-stage-providers.sh
   ```

   This includes Microsoft.Network. Resource-group Contributor cannot grant itself subscription registration rights.

2. After reviewing and pushing the changes, run **Staging infrastructure → preview**, review the B1 upgrade, VNet/subnet, SQL subnet rule, and settings, then explicitly run **apply**. B1 charges begin when applied. Leave public access disabled.

3. Review the initial schema and bootstrap source, then run:

   ```bash
   bash scripts/azure/bootstrap-stage-database.sh
   ```

   This stops the Azure app, creates the initial empty schema using EF migrations, and establishes database users/roles. It leaves the app stopped for its first deployment. Existing databases with pending migrations are rejected: later schema changes belong in the maintenance release workflow. An already-current database can have its grants reapplied without schema changes.

The bootstrap recovery lease uses `artifacts/azure/bootstrap-target.json` and `artifacts/azure/bootstrap-firewall.json`; use those paths for explicit cleanup if needed.

The existing deployment identity receives the custom `hockey_migrator` role: table creation plus schema ALTER/REFERENCES and data/history access inside hockey-stage. It receives neither db_owner nor user/role administration permissions. DDL rights are still powerful; protect trusted release code and review migrations. The runtime identity receives CRUD on the three application tables and SELECT on migration history. It cannot migrate schema. Permission changes belong in deliberate administrator setup, not every release.

The administrator tool uses Entra object IDs to create SQL users without Graph lookup permissions. A conflicting existing identity stops bootstrap rather than silently replacing it. [Azure SQL managed identity guidance](https://learn.microsoft.com/en-us/azure/azure-sql/database/authentication-azure-ad-user-assigned-managed-identity?view=azuresql).

## Normal release

CI builds an application ZIP, reviewable idempotent SQL, and the standard self-contained Linux EF migration bundle from the same commit. CI applies the bundle twice to a disposable SQL Server database; the existing SQL integration test also exercises initial schema creation using the migration role. Azure identity/routing remain deployment checks.

**Preview staging database** accepts a successful push-to-main CI run matching current main. It shows that artifact's exact SQL, target, and checksum. Preview does not connect to SQL or change permissions/firewall rules.

**Deploy staging application** uses the same trusted artifact and performs the maintenance release:

1. Validate artifact, target, hosted SQL settings, and VNet integration.
2. Temporarily allow this runner's public IP, then verify SQL connectivity and migration permissions before downtime.
3. Stop the app and confirm Azure reports Stopped.
4. Run the tested EF migration bundle. No users or permissions are changed here.
5. Deploy the matching app without automatic restart, then explicitly start it and check liveness, database readiness, and React.
6. Remove the temporary SQL firewall rule, regardless of success or failure.

A failure before maintenance leaves the running app untouched. A failure/cancellation after entering maintenance leaves it stopped; a failed startup smoke check stops it again. There is no automatic Down migration, database restore, or restart of an old potentially incompatible app. Investigate the recorded failure and use an explicitly reviewed recovery procedure. Releases must not assume schema changes can always be reversed safely.

## Temporary IP cleanup

The app's permanent SQL access uses its subnet. Only bootstrap and migration administration use temporary caller-IP rules, discovered fresh each time. No permanent runner-IP list is maintained.

The recorded lease is written before creating the rule, so even an ambiguous create failure can be cleaned up. Bootstrap uses EXIT/signal cleanup; the release workflow uses an independent `always()` cleanup step. Cleanup retries five times, checks Azure to confirm absence, and only then removes the lease. An unsuccessful cleanup fails visibly and preserves the lease; the workflow saves recovery information in the `staging-firewall-cleanup` artifact.

For explicit recovery, download that artifact and run:

```bash
python3 scripts/azure/database.py firewall-remove artifacts/azure/database-target.json artifacts/azure/database-firewall.json
```

Cleanup only touches the uniquely recorded `temporary-database-*` rule. It cannot remove unrelated firewall rules. Force-destroying the runner or a sustained Azure outage can prevent any cleanup command from executing; this cannot be guaranteed away by a finally step. Use the saved lease or inspect that uniquely named staging rule if a run is force-terminated.

## Production later

Reuse the same infrastructure and maintenance sequence with a separate prod environment, database, deployment identity, and runtime identity. Bootstrap each environment once with its own grants. Current helpers intentionally reject production targets, and no production workflow/resources are enabled. Relax those guards only when production rollout and recovery are reviewed. Backups/restore verification, user authentication, and team authorization are separate unfinished work.
