"""Production parameters cannot target staging or open public access."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
VALIDATOR = ROOT / "scripts/azure/validate-environment-settings.py"
PROJECT_REF = "p" * 20


class ProdSettingsTests(unittest.TestCase):
    def validate(self, project_ref=PROJECT_REF, **overrides):
        values = {
            "environment": "prod",
            "webAppName": "hockey-mgmt-app-prod",
            "location": "swedencentral",
            "keyVaultName": "kv-hockey-prod",
            "databaseSecretName": "supabase-db-connection",
            "databaseConnectionString": "test-connection-not-used",
            "supabaseUrl": f"https://{project_ref}.supabase.co",
            "supabasePublishableKey": "sb_publishable_test",
            "enablePublicAccess": False,
        }
        values.update(overrides)
        with tempfile.TemporaryDirectory() as directory:
            parameters = Path(directory) / "prod.parameters.json"
            parameters.write_text(json.dumps({"parameters": {key: {"value": value} for key, value in values.items()}}))
            return subprocess.run(
                [sys.executable, str(VALIDATOR), "prod", str(parameters)],
                cwd=ROOT,
                env={**os.environ, "SUPABASE_PROJECT_REF": project_ref},
                text=True,
                capture_output=True,
                check=False,
            )

    def test_accepts_private_production_parameters(self):
        self.assertEqual(0, self.validate().returncode)

    def test_rejects_staging_targets(self):
        cases = (
            {"webAppName": "hockey-mgmt-app-stage"},
            {"keyVaultName": "kv-hockey-stage"},
        )
        for overrides in cases:
            with self.subTest(overrides=overrides):
                self.assertNotEqual(0, self.validate(**overrides).returncode)
        self.assertNotEqual(0, self.validate(project_ref="wbnjumvxvxwvbimqjccu").returncode)

    def test_public_evaluation_requires_the_recorded_exception(self):
        self.assertEqual(0, self.validate(enablePublicAccess=True).returncode)


if __name__ == "__main__":
    unittest.main()
