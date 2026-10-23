"""Select only the tested artifact for the current main commit."""
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("verify_ci_run", Path(__file__).resolve().parents[1] / "verify-ci-run.py")
verify_ci_run_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify_ci_run_module)


class VerifyCiRunTests(unittest.TestCase):
    repository = "alillje/hockey-mgmt-app"
    commit = "a" * 40

    def trusted_run(self):
        return {
            "conclusion": "success",
            "status": "completed",
            "event": "push",
            "head_branch": "main",
            "head_sha": self.commit,
            "path": ".github/workflows/ci.yml@refs/heads/main",
            "head_repository": {"full_name": self.repository},
        }

    def test_selects_successful_ci_for_current_commit(self):
        get_json_patch = patch.object(verify_ci_run_module, "get_json")
        get_json = get_json_patch.start()
        self.addCleanup(get_json_patch.stop)
        get_json.return_value = {"workflow_runs": [{"id": 12345}]}
        self.assertEqual("12345", verify_ci_run_module.current_main_ci_run(self.repository, self.commit))
        self.assertIn(f"head_sha={self.commit}", get_json.call_args.args[0])
        self.assertIn("event=push", get_json.call_args.args[0])

    def test_waits_for_ci_before_releasing(self):
        with patch.object(verify_ci_run_module, "get_json", return_value={"workflow_runs": []}):
            with self.assertRaisesRegex(SystemExit, "Wait for CI"):
                verify_ci_run_module.current_main_ci_run(self.repository, self.commit)

    def test_rejects_stale_or_untrusted_ci_runs(self):
        verify_ci_run_module.verify_ci_run(self.trusted_run(), "12345", self.repository, self.commit)
        for changed in (
            {"head_sha": "b" * 40},
            {"event": "workflow_dispatch"},
            {"head_repository": {"full_name": "someone/else"}},
            {"path": ".github/workflows/other.yml"},
        ):
            with self.subTest(changed=changed), self.assertRaises(SystemExit):
                verify_ci_run_module.verify_ci_run(self.trusted_run() | changed, "12345", self.repository, self.commit)


if __name__ == "__main__":
    unittest.main()
