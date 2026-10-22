import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import database


def target():
    return {
        "environment": "stage", "resourceGroup": "rg-hockey-stage",
        "serverName": "sql-hockey-stage-example", "serverHost": "sql-hockey-stage-example.database.windows.net",
        "databaseName": "hockey-stage", "runtimeIdentityName": "hockey-mgmt-app-stage",
        "runtimeIdentityObjectId": "00112233-4455-6677-8899-aabbccddeeff",
        "deploymentIdentityObjectId": "11223344-5566-7788-99aa-bbccddeeff00",
    }


class StageDatabaseTests(unittest.TestCase):
    def test_production_host_mismatch_and_identity_reuse_are_rejected(self):
        for replacement in ({"environment": "prod"}, {"databaseName": "hockey-prod"},
                            {"serverHost": "other.database.windows.net"},
                            {"deploymentIdentityObjectId": target()["runtimeIdentityObjectId"]}):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                database.validate_target(target() | replacement)

    def test_cleanup_can_handle_azure_cli_deletes_without_json(self):
        with patch.object(database.subprocess, "check_output", return_value=""):
            self.assertIsNone(database.azure("sql", "server", "firewall-rule", "delete"))

    def test_cleanup_removes_only_the_recorded_temporary_rule(self):
        with tempfile.TemporaryDirectory() as directory:
            target_path = Path(directory) / "target.json"
            lease_path = Path(directory) / "lease.json"
            target_path.write_text(json.dumps(target()))
            name = "temporary-database-" + "a" * 32
            lease_path.write_text(json.dumps({"server": target()["serverName"], "group": target()["resourceGroup"], "rule": name}))
            with patch.object(database, "azure", side_effect=[[{"name": name}, {"name": "other-rule"}], None, [{"name": "other-rule"}]]) as azure:
                database.manage_firewall("remove", target_path, lease_path)
                self.assertEqual(azure.call_count, 3)
                self.assertEqual(azure.call_args_list[1].args[-1], name)
            self.assertFalse(lease_path.exists())

    def test_cleanup_refuses_unrelated_rules(self):
        with tempfile.TemporaryDirectory() as directory:
            target_path = Path(directory) / "target.json"
            lease_path = Path(directory) / "lease.json"
            target_path.write_text(json.dumps(target()))
            lease_path.write_text(json.dumps({"server": target()["serverName"], "group": target()["resourceGroup"], "rule": "keep-this-rule"}))
            with patch.object(database, "azure") as azure, self.assertRaises(ValueError):
                database.manage_firewall("remove", target_path, lease_path)
            azure.assert_not_called()

    def test_rule_creation_records_cleanup_before_an_azure_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target_path = Path(directory) / "target.json"
            lease_path = Path(directory) / "lease.json"
            target_path.write_text(json.dumps(target()))
            with patch.object(database.subprocess, "check_output", return_value="8.8.8.8"), patch.object(database, "azure", side_effect=RuntimeError("failed")):
                with self.assertRaises(RuntimeError):
                    database.manage_firewall("add", target_path, lease_path)
            saved = json.loads(lease_path.read_text())
            self.assertTrue(saved["rule"].startswith("temporary-database-"))
            self.assertEqual(saved["server"], target()["serverName"])

    def test_cleanup_retries_when_azure_still_reports_the_deleted_rule(self):
        with tempfile.TemporaryDirectory() as directory:
            target_path = Path(directory) / "target.json"
            lease_path = Path(directory) / "lease.json"
            target_path.write_text(json.dumps(target()))
            name = "temporary-database-" + "b" * 32
            lease_path.write_text(json.dumps({"server": target()["serverName"], "group": target()["resourceGroup"], "rule": name}))
            with patch.object(database, "azure", side_effect=[[{"name": name}], None, [{"name": name}], [{"name": name}], None, []]) as azure, patch.object(database.time, "sleep") as sleep:
                database.manage_firewall("remove", target_path, lease_path)
            self.assertEqual(azure.call_count, 6)
            sleep.assert_called_once()
            self.assertFalse(lease_path.exists())

    def test_exhausted_cleanup_fails_and_keeps_the_lease_for_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            target_path = Path(directory) / "target.json"
            lease_path = Path(directory) / "lease.json"
            target_path.write_text(json.dumps(target()))
            name = "temporary-database-" + "c" * 32
            lease_path.write_text(json.dumps({"server": target()["serverName"], "group": target()["resourceGroup"], "rule": name}))
            with patch.object(database, "azure", side_effect=database.subprocess.CalledProcessError(1, "az")) as azure, patch.object(database.time, "sleep"), self.assertRaisesRegex(RuntimeError, "five attempts"):
                database.manage_firewall("remove", target_path, lease_path)
            self.assertEqual(azure.call_count, 5)
            self.assertTrue(lease_path.exists())
