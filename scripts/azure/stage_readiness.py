"""Evaluate the prerequisites shared by staging infrastructure and app releases."""

REQUIRED_CHECKS = (
    "supabaseAuthenticationImplemented",
    "postgresqlProviderAndReviewedMigrationsImplemented",
    "reactAssetsServedByAspNetCore",
)


def incomplete_checks(checks):
    incomplete = [name for name in REQUIRED_CHECKS if checks.get(name) is not True]
    if (checks.get("teamAuthorizationImplemented") is not True
            and checks.get("sharedWorkspaceApproved") is not True):
        incomplete.append("teamAuthorizationImplemented or sharedWorkspaceApproved")
    if (checks.get("runtimeDatabasePermissionsConfigured") is not True
            and checks.get("runtimeDatabaseReadinessGateAtDeploy") is not True):
        incomplete.append("runtimeDatabasePermissionsConfigured or runtimeDatabaseReadinessGateAtDeploy")
    if (checks.get("backupAndRestoreProcedureVerified") is not True
            and checks.get("backupAndRestoreDeferredForStagePoc") is not True):
        incomplete.append("backupAndRestoreProcedureVerified or backupAndRestoreDeferredForStagePoc")
    return incomplete
