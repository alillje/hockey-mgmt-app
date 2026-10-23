"""Evaluate the prerequisites shared by staging infrastructure and app releases."""

REQUIRED_CHECKS = (
    "supabaseAuthenticationImplemented",
    "postgresqlProviderAndReviewedMigrationsImplemented",
    "reactAssetsServedByAspNetCore",
    "runtimeDatabasePermissionsConfigured",
    "backupAndRestoreProcedureVerified",
)


def incomplete_checks(checks):
    incomplete = [name for name in REQUIRED_CHECKS if checks.get(name) is not True]
    if (checks.get("teamAuthorizationImplemented") is not True
            and checks.get("sharedWorkspaceApproved") is not True):
        incomplete.append("teamAuthorizationImplemented or sharedWorkspaceApproved")
    return incomplete
