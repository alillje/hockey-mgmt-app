import unittest

from scripts.azure.stage_readiness import REQUIRED_CHECKS, incomplete_checks


class StageReadinessTests(unittest.TestCase):
    def complete_checks(self):
        return {name: True for name in REQUIRED_CHECKS}

    def test_approved_shared_workspace_can_replace_team_authorization_for_stage(self):
        checks = self.complete_checks() | {
            "teamAuthorizationImplemented": False,
            "sharedWorkspaceApproved": True,
        }
        self.assertEqual([], incomplete_checks(checks))

    def test_shared_workspace_approval_does_not_waive_authentication(self):
        checks = self.complete_checks() | {
            "supabaseAuthenticationImplemented": False,
            "teamAuthorizationImplemented": False,
            "sharedWorkspaceApproved": True,
        }
        self.assertEqual(["supabaseAuthenticationImplemented"], incomplete_checks(checks))

    def test_requires_teams_or_explicit_tester_exception(self):
        checks = self.complete_checks() | {
            "teamAuthorizationImplemented": False,
            "sharedWorkspaceApproved": False,
        }
        self.assertEqual(
            ["teamAuthorizationImplemented or sharedWorkspaceApproved"],
            incomplete_checks(checks),
        )


if __name__ == "__main__":
    unittest.main()
