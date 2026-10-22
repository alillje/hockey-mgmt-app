"""Regression coverage for the Azure CLI output change that blocked preview."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


CHECK = Path(__file__).resolve().parents[1] / "check-dotnet-runtime.py"


class RuntimeCheckTests(unittest.TestCase):
    def check_runtime(self, response):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "runtimes.json"
            report.write_text(json.dumps(response))
            return subprocess.run(
                [sys.executable, str(CHECK), str(report)],
                capture_output=True,
                text=True,
                check=False,
            )

    def test_accepts_structured_linux_runtime_records(self):
        result = self.check_runtime([
            {"os": "linux", "runtime": ".NET", "version": "10.0", "config": "DOTNETCORE|10.0", "support": "Active"},
        ])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_legacy_string_identifiers(self):
        for identifier in ("DOTNETCORE:10.0", "DOTNETCORE|10.0"):
            with self.subTest(identifier=identifier):
                result = self.check_runtime(["NODE:22-lts", identifier])
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_missing_runtime_with_an_actionable_error(self):
        result = self.check_runtime([{"os": "linux", "config": "DOTNETCORE|8.0"}])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Available .NET identifiers: DOTNETCORE|8.0", result.stderr)
        self.assertIn("preview has not run", result.stderr)

    def test_does_not_accept_a_windows_runtime_as_linux(self):
        result = self.check_runtime([{"os": "windows", "config": "DOTNETCORE|10.0"}])
        self.assertNotEqual(result.returncode, 0)

    def test_rejects_an_unexpected_response_shape(self):
        result = self.check_runtime({"error": "unexpected response"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("JSON array", result.stderr)


if __name__ == "__main__":
    unittest.main()
