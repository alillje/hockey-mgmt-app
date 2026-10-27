"""Package disposable fixture files, without building or contacting any service."""
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("release", ROOT / "scripts/azure/release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


@unittest.skipUnless(shutil.which("zip"), "Packaging requires zip")
class PackageApplicationTests(unittest.TestCase):
    def test_package_carries_matching_application_migrations_certificates_and_build_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            files = {
                "artifacts/publish/wwwroot/index.html": b"<div id='root'></div>",
                "artifacts/publish/app.dll": b"application fixture",
                "artifacts/migrations/postgresql.sql": b"-- reviewed migration fixture",
                "artifacts/migrations/efbundle": b"\x7fELF bundle fixture",
                "artifacts/migrations/Certificates/supabase-stage-root.crt": b"public stage CA fixture",
                "artifacts/migrations/Certificates/supabase-prod-root.crt": b"public prod CA fixture",
                "backend/appsettings.json": b"{}",
                "iac/stage/application-readiness.json": b"{}",
                "iac/prod/application-readiness.json": b"{}",
            }
            for name, content in files.items():
                path = directory / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            environment = os.environ | {
                "GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/main",
                "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "2",
            }
            package_script = ROOT / "scripts/ci/package-application.sh"
            subprocess.run(["bash", str(package_script)], cwd=directory, env=environment, check=True, capture_output=True)
            package = directory / "artifacts/application"
            metadata = json.loads((package / "release.json").read_text())
            self.assertEqual({"commit": "a" * 40, "runId": "123", "runAttempt": "2"}, metadata)
            release.verify_package({"commit": "a" * 40, "ciRunId": "123", "ciRunAttempt": 2}, package)
            self.assertEqual(files["artifacts/migrations/efbundle"], (package / "efbundle").read_bytes())
            self.assertEqual(files["artifacts/migrations/postgresql.sql"], (package / "postgresql.sql").read_bytes())
            self.assertTrue((package / "Certificates/supabase-prod-root.crt").is_file())
            self.assertTrue((package / "Certificates/supabase-stage-root.crt").is_file())
            environment["GITHUB_EVENT_NAME"] = "pull_request"
            blocked = subprocess.run(["bash", str(package_script)], cwd=directory, env=environment, capture_output=True)
            self.assertNotEqual(0, blocked.returncode)


if __name__ == "__main__":
    unittest.main()
