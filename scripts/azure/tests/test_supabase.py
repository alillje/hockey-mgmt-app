"""Protect hosted Npgsql configuration without real credentials."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("supabase", Path(__file__).resolve().parents[1] / "supabase.py")
supabase = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(supabase)


class SupabaseConnectionTests(unittest.TestCase):
    project = "abcdefghijklmnopqrst"
    connection = "Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.abcdefghijklmnopqrst;Password='a;quoted''password';SSL Mode=VerifyFull"

    def validate(self, connection=None):
        supabase.validate_connection(self.project, connection or self.connection)

    def test_accepts_npgsql_and_preserves_quoted_password(self):
        self.validate()
        self.assertEqual("a;quoted'password", supabase.connection_settings(self.connection)["password"])

    def test_rejects_uri_without_echoing_it(self):
        uri = "postgresql://postgres.abcdefghijklmnopqrst:private-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
        with self.assertRaisesRegex(ValueError, "Npgsql") as error:
            self.validate(uri)
        self.assertNotIn("private-password", str(error.exception))

    def test_rejects_different_project_and_custom_role(self):
        for username in ("postgres." + "z" * 20, "hockey_runtime." + self.project):
            with self.subTest(username=username), self.assertRaisesRegex(ValueError, "project reference"):
                self.validate(self.connection.replace("postgres." + self.project, username))

    def test_rejects_transaction_pooling(self):
        with self.assertRaisesRegex(ValueError, "5432"):
            self.validate(self.connection.replace("5432", "6543"))

    def test_requires_verified_tls(self):
        for mode in ("Require", "Disable"):
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "VerifyFull"):
                self.validate(self.connection.replace("VerifyFull", mode))

    def test_rejects_duplicate_settings_and_tls_bypass(self):
        for suffix in (";Password=other", ";Trust Server Certificate=true"):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                self.validate(self.connection + suffix)

    def test_rejects_empty_and_placeholder_password(self):
        for password in ("", "[YOUR-PASSWORD]"):
            with self.subTest(password=password), self.assertRaisesRegex(ValueError, "actual project database password"):
                self.validate(self.connection.replace("'a;quoted''password'", '"' + password + '"'))

    def test_rejects_unknown_options_without_echoing_secrets(self):
        secret = "this-secret-must-not-appear"
        with self.assertRaises(ValueError) as raised:
            self.validate(self.connection + ";" + secret + "=unsafe")
        self.assertNotIn(secret, str(raised.exception))

    def test_rejects_absent_ca_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, "missing"):
            supabase.validate_connection(self.project, self.connection + ";Root Certificate=Certificates/supabase-root.crt", Path(directory))
        with self.assertRaisesRegex(ValueError, "Root Certificate"):
            self.validate(self.connection + ";Root Certificate=../private.pem")

    def test_accepts_packaged_ca(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            (package / "Certificates").mkdir()
            (package / "Certificates/supabase-root.crt").touch()
            supabase.validate_connection(self.project, self.connection + ";Root Certificate=Certificates/supabase-root.crt", package)


if __name__ == "__main__":
    unittest.main()
