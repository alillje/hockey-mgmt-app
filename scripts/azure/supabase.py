#!/usr/bin/env python3
"""Validate hosted database secrets without printing or persisting credentials."""
import os
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit


def connection_settings(connection):
    """Read ADO.NET key/value pairs, including quoted passwords and semicolons."""
    if connection.startswith(("postgresql://", "postgres://")):
        try:
            uri = urlsplit(connection)
            options = parse_qsl(uri.query, keep_blank_values=True, strict_parsing=True)
            if uri.fragment or any(key not in {"sslmode", "sslrootcert"} for key, _ in options):
                raise ValueError()
            if len({key for key, _ in options}) != len(options):
                raise ValueError()
            settings = {
                "host": uri.hostname or "", "port": str(uri.port or 5432),
                "database": unquote(uri.path.removeprefix("/")),
                "username": unquote(uri.username or ""), "password": unquote(uri.password or ""),
                "sslmode": "VerifyFull",
            }
            for key, value in options:
                settings["sslmode" if key == "sslmode" else "rootcertificate"] = value.replace("-", "") if key == "sslmode" else value
            return settings
        except ValueError:
            raise ValueError("Invalid PostgreSQL URI or unsupported connection options.") from None
    settings = {}
    position = 0
    pattern = re.compile(r'\s*([^=;]+)\s*=\s*(?:"((?:[^"]|"")*)"|\'((?:[^\']|\'\')*)\'|([^;]*))\s*(?:;|$)')
    while position < len(connection):
        match = pattern.match(connection, position)
        if not match:
            raise ValueError("Invalid connection string syntax.")
        key, double, single, plain = match.groups()
        key = key.strip().lower().replace(" ", "")
        aliases = {"userid": "username", "user": "username", "server": "host", "pwd": "password"}
        key = aliases.get(key, key)
        if key in settings:
            raise ValueError("Duplicate connection string setting.")
        allowed = {
            "host", "port", "database", "username", "password", "sslmode",
            "trustservercertificate", "timeout", "commandtimeout", "pooling",
            "maximumpoolsize", "minimumpoolsize", "keepalive",
            "rootcertificate",
        }
        if key not in allowed:
            raise ValueError("Unsupported connection string setting. Use the documented database connection template.")
        settings[key] = double.replace('""', '"') if double is not None else single.replace("''", "'") if single is not None else plain.strip()
        position = match.end()
    return settings


def npgsql_connection_string(connection):
    """Convert a dashboard URI for .NET without exposing its password in output."""
    if not connection.startswith(("postgresql://", "postgres://")):
        return connection
    names = {"host": "Host", "port": "Port", "database": "Database", "username": "Username",
             "password": "Password", "sslmode": "SSL Mode", "rootcertificate": "Root Certificate"}
    return ";".join(names[key] + '="' + value.replace('"', '""') + '"'
                    for key, value in connection_settings(connection).items())


def validate_connection(project_ref, connection, package_directory=Path("artifacts/stage-package")):
    if not re.fullmatch(r"[a-z]{20}", project_ref):
        raise ValueError("Set SUPABASE_PROJECT_REF to the 20-letter staging project reference.")
    settings = connection_settings(connection)
    if not re.fullmatch(r"[a-z0-9.-]+\.pooler\.supabase\.com", settings.get("host", "")):
        raise ValueError("Use the Supabase IPv4 session-pooler host.")
    if settings.get("port", "5432") != "5432" or settings.get("database") != "postgres":
        raise ValueError("Use session-pooler port 5432 and database postgres.")
    if settings.get("username") != f"postgres.{project_ref}":
        raise ValueError("Use the standard postgres session-pooler username for the configured project reference.")
    if settings.get("sslmode", "").lower() != "verifyfull":
        raise ValueError("Database connections require SSL Mode=VerifyFull.")
    if settings.get("trustservercertificate", "false").lower() != "false":
        raise ValueError("Do not bypass database TLS certificate validation.")
    if not settings.get("password", "").strip() or settings["password"] in {"[YOUR-PASSWORD]", "<password>"}:
        raise ValueError("Store the actual project database password in the GitHub environment secret.")
    if "rootcertificate" in settings:
        if settings["rootcertificate"] != "Certificates/supabase-root.crt":
            raise ValueError("Use Root Certificate=Certificates/supabase-root.crt for the packaged public database CA.")
        if not (package_directory / "Certificates/supabase-root.crt").is_file():
            raise ValueError("The reviewed artifact is missing the configured public database CA certificate.")


if __name__ == "__main__":
    try:
        validate_connection(
            os.environ.get("SUPABASE_PROJECT_REF", ""),
            os.environ.get("SUPABASE_DATABASE_CONNECTION_STRING", ""),
        )
    except ValueError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
    print("Validated staging database project, standard connection, session pooling, and TLS.")
