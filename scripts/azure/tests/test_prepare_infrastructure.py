"""Check environment selection and private parameter handling without Azure."""
import importlib.util
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("prepare_infrastructure", SCRIPTS / "prepare-infrastructure.py")
prepare = importlib.util.module_from_spec(SPEC)
with patch.object(sys, "path", [str(SCRIPTS), *sys.path]):
    SPEC.loader.exec_module(prepare)


class PrepareInfrastructureTests(unittest.TestCase):
    def test_compiles_selected_environment_file_and_restricts_private_parameter_permissions(self):
        for environment in ("stage", "prod"):
            with self.subTest(environment=environment), tempfile.TemporaryDirectory() as temporary:
                parameters = Path(temporary) / "private/parameters.json"
                calls = []

                def compile_or_validate(command, check):
                    self.assertTrue(check)
                    calls.append(command)
                    if command[0] == "az":
                        parameters.write_text('{"parameters": {}}')
                    else:
                        self.assertEqual(0o600, stat.S_IMODE(parameters.stat().st_mode))

                previous_umask = os.umask(0o077)
                try:
                    with patch.dict(os.environ, {
                        "HOCKEY_DEPLOY_ENVIRONMENT": environment, "AZURE_RESOURCE_GROUP": f"rg-hockey-{environment}",
                        "SUPABASE_PROJECT_REF": "p" * 20, "SUPABASE_DATABASE_CONNECTION_STRING": "fixture-secret",
                        "PRIVATE_PARAMETERS_FILE": str(parameters),
                    }), patch.object(prepare, "validate_connection") as validate, patch.object(
                            prepare.subprocess, "run", side_effect=compile_or_validate):
                        prepare.main()
                    self.assertEqual(environment, validate.call_args.args[3])
                    self.assertIn(f"iac/parameters/{environment}.bicepparam", calls[0])
                    self.assertEqual(environment, calls[1][2])
                    self.assertEqual(0o700, stat.S_IMODE(parameters.parent.stat().st_mode))
                finally:
                    os.umask(previous_umask)

    def test_invalid_environment_and_production_resource_group_fail_before_compilation(self):
        for environment, resource_group in (("other", "rg-hockey-stage"), ("prod", "rg-hockey-stage")):
            with self.subTest(environment=environment), patch.dict(os.environ, {
                "HOCKEY_DEPLOY_ENVIRONMENT": environment, "AZURE_RESOURCE_GROUP": resource_group,
            }), patch.object(prepare.subprocess, "run") as compile_parameters:
                with self.assertRaises(SystemExit):
                    prepare.main()
                compile_parameters.assert_not_called()


if __name__ == "__main__":
    unittest.main()
