"""Production-project evaluation must be explicitly recorded."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CHECKER = ROOT / "scripts/azure/check-prod-readiness.py"


class ProdReadinessTests(unittest.TestCase):
    def check(self, **overrides):
        report = json.loads((ROOT / "iac/prod/application-readiness.json").read_text())
        report.update(overrides)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "readiness.json"
            path.write_text(json.dumps(report))
            return subprocess.run(
                [sys.executable, str(CHECKER), str(path)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_recorded_temporary_evaluation_passes(self):
        self.assertEqual(0, self.check().returncode)

    def test_missing_approval_or_auth_fails(self):
        self.assertNotEqual(0, self.check(temporaryProdEvaluationApproved=False).returncode)
        self.assertNotEqual(0, self.check(supabaseAuthenticationImplemented=False).returncode)


if __name__ == "__main__":
    unittest.main()
