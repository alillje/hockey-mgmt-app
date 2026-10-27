#!/usr/bin/env python3
"""Compile environment parameters privately; never connect to the database."""
import os
import subprocess
from pathlib import Path

from supabase import validate_connection


def main():
    environment = os.environ["HOCKEY_DEPLOY_ENVIRONMENT"]
    if environment not in {"stage", "prod"}:
        raise SystemExit("Infrastructure environment must be stage or prod.")
    if environment == "prod" and os.environ["AZURE_RESOURCE_GROUP"] != "rg-hockey-prod":
        raise SystemExit("Production infrastructure must target rg-hockey-prod.")
    validate_connection(os.environ["SUPABASE_PROJECT_REF"],
                        os.environ["SUPABASE_DATABASE_CONNECTION_STRING"], Path("backend"), environment)
    os.umask(0o077)
    parameters = Path(os.environ["PRIVATE_PARAMETERS_FILE"])
    parameters.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    subprocess.run(["az", "bicep", "build-params", "--file", f"iac/parameters/{environment}.bicepparam",
                    "--outfile", str(parameters)], check=True)
    parameters.chmod(0o600)
    subprocess.run(["python3", "scripts/azure/validate-environment-settings.py", environment, str(parameters)], check=True)


if __name__ == "__main__":
    main()
