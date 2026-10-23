#!/usr/bin/env python3
"""Validate compiled staging parameters before any infrastructure deployment."""
import json
import re
import sys
from pathlib import Path

parameters = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/azure/stage.parameters.json").read_text())["parameters"]
values = {name: parameter["value"] for name, parameter in parameters.items()}
if values.get("environment") != "stage":
    raise SystemExit("This workflow may only deploy the stage parameter file.")
for name in ("webAppName", "location", "keyVaultName", "databaseSecretName", "databaseConnectionString"):
    if not str(values.get(name, "")).strip():
        raise SystemExit(f"Missing staging parameter: {name}")
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]", values["webAppName"]):
    raise SystemExit("Use a 2–60 character web app name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]", values["keyVaultName"]):
    raise SystemExit("Use a 3–24 character Key Vault name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z0-9-]{1,127}", values["databaseSecretName"]):
    raise SystemExit("Use a valid database secret name containing letters, numbers, or hyphens.")
if values.get("enablePublicAccess"):
    checks = json.loads(Path("iac/stage/application-readiness.json").read_text())
    if not checks or not all(value is True for value in checks.values()):
        raise SystemExit("Public access requires all tracked application-readiness tasks to be complete.")
print("Validated stage-only infrastructure parameters.")
