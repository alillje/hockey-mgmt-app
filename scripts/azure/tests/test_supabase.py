"""Protect database target and secret conversion without using real credentials."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("supabase", Path(__file__).resolve().parents[1] / "supabase.py")
supabase = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(supabase)


class SupabaseConnectionTests(unittest.TestCase):
    project = "abcdefghijklmnopqrst"
    uri = "postgresql://postgres.abcdefghijklmnopqrst:p%40ss%3Bword@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
    connection = "Host=aws-0-eu-west-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.abcdefghijklmnopqrst;Password='a;quoted''password';SSL Mode=VerifyFull"

    def validate(self, connection=None):
        supabase.validate_connection(self.project, connection or self.connection)

    def test_accepts_standard_dashboard_uri(self):
        self.validate(self.uri)

    def test_converts_uri_preserving_encoded_password_and_verified_tls(self):
        converted = supabase.npgsql_connection_string(self.uri)
        self.validate(converted)
        settings = supabase.connection_settings(converted)
        self.assertEqual("p@ss;word", settings["password"])
        self.assertEqual("VerifyFull", settings["sslmode"])

    def test_preserves_npgsql_connection_strings(self):
        self.assertEqual(self.connection, supabase.npgsql_connection_string(self.connection))
        self.validate()

    def test_rejects_different_project_and_custom_role(self):
        for username in ("postgres." + "z" * 20, "hockey_runtime." + self.project):
            with self.subTest(username=username), self.assertRaisesRegex(ValueError, "project reference"):
                self.validate(self.connection.replace("postgres." + self.project, username))

    def test_rejects_transaction_pooling(self):
        with self.assertRaisesRegex(ValueError, "5432"):
            self.validate(self.uri.replace(":5432", ":6543"))

    def test_requires_verified_tls(self):
        for connection in (self.connection.replace("VerifyFull", "Require"), self.uri + "?sslmode=require"):
            with self.subTest(connection=connection), self.assertRaisesRegex(ValueError, "VerifyFull"):
                self.validate(connection)

    def test_rejects_duplicate_settings_and_tls_bypass(self):
        for suffix in (";Password=other", ";Trust Server Certificate=true"):
            with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                self.validate(self.connection + suffix)

    def test_rejects_empty_and_placeholder_password(self):
        for password in ("", "[YOUR-PASSWORD]"):
            with self.subTest(password=password), self.assertRaisesRegex(ValueError, "actual project database password"):
                self.validate(self.uri.replace("p%40ss%3Bword", password))

    def test_invalid_uri_and_unknown_options_never_echo_secrets(self):
        secret = "this-secret-must-not-appear"
        for connection in (self.uri.replace(":5432", ":" + secret), self.uri + "?options=" + secret,
                           self.uri + "?sslmode=verify-full&sslmode=" + secret, self.connection + ";" + secret + "=unsafe"):
            with self.subTest(connection=connection), self.assertRaises(ValueError) as raised:
                self.validate(connection)
            self.assertNotIn(secret, str(raised.exception))

    def test_rejects_absent_configured_ca_and_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, "missing"):
            supabase.validate_connection(self.project, self.connection + ";Root Certificate=Certificates/supabase-root.crt", Path(directory))
        with self.assertRaisesRegex(ValueError, "Root Certificate"):
            self.validate(self.uri + "?sslrootcert=../private.pem")

    def test_accepts_packaged_ca(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            (package / "Certificates").mkdir()
            (package / "Certificates/supabase-root.crt").touch()
            supabase.validate_connection(self.project, self.uri + "?sslrootcert=Certificates/supabase-root.crt", package)


if __name__ == "__main__":
    unittest.main()
