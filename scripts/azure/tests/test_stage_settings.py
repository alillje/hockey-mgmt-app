import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = ROOT / "scripts/azure/validate-environment-settings.py"
PROJECT_REF = "stagevalidationref01"


class StageSettingsTests(unittest.TestCase):
    def validate(self, **overrides):
        values = {
            "environment": "stage",
            "webAppName": "hockey-stage-validation",
            "location": "swedencentral",
            "keyVaultName": "kv-hockey-stage",
            "databaseSecretName": "supabase-db-connection",
            "databaseConnectionString": "test-connection-not-used",
            "supabaseUrl": f"https://{PROJECT_REF}.supabase.co",
            "supabasePublishableKey": "sb_publishable_test",
            "enablePublicAccess": False,
        }
        values.update(overrides)
        with tempfile.TemporaryDirectory() as directory:
            parameters = Path(directory) / "stage.parameters.json"
            parameters.write_text(json.dumps({"parameters": {key: {"value": value} for key, value in values.items()}}))
            return subprocess.run(
                [sys.executable, str(VALIDATOR), "stage", str(parameters)],
                cwd=ROOT,
                env={**os.environ, "SUPABASE_PROJECT_REF": PROJECT_REF},
                text=True,
                capture_output=True,
                check=False,
            )

    def test_accepts_matching_project_and_tester(self):
        self.assertEqual(0, self.validate().returncode)

    def test_rejects_mismatched_project(self):
        result = self.validate(supabaseUrl="https://anotherprojectref01.supabase.co")
        self.assertNotEqual(0, result.returncode)
        self.assertIn("must match SUPABASE_PROJECT_REF", result.stderr)


if __name__ == "__main__":
    unittest.main()
