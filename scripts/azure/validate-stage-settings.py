#!/usr/bin/env python3
"""Validate compiled staging parameters before any infrastructure deployment."""
import json
import os
import re
import sys
from pathlib import Path
from stage_readiness import incomplete_checks

parameters = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/azure/stage.parameters.json").read_text())["parameters"]
values = {name: parameter["value"] for name, parameter in parameters.items()}
if values.get("environment") != "stage":
    raise SystemExit("This workflow may only deploy the stage parameter file.")
for name in ("webAppName", "location", "keyVaultName", "databaseSecretName", "databaseConnectionString", "supabaseUrl", "supabasePublishableKey"):
    if not str(values.get(name, "")).strip():
        raise SystemExit(f"Missing staging parameter: {name}")
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]", values["webAppName"]):
    raise SystemExit("Use a 2–60 character web app name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]", values["keyVaultName"]):
    raise SystemExit("Use a 3–24 character Key Vault name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z0-9-]{1,127}", values["databaseSecretName"]):
    raise SystemExit("Use a valid database secret name containing letters, numbers, or hyphens.")
project_ref = os.environ.get("SUPABASE_PROJECT_REF", "")
if not re.fullmatch(r"[a-z0-9]{20}", project_ref) or values["supabaseUrl"] != f"https://{project_ref}.supabase.co":
    raise SystemExit("The stage Supabase URL must match SUPABASE_PROJECT_REF.")
if not values["supabasePublishableKey"].startswith("sb_publishable_"):
    raise SystemExit("Use a Supabase publishable key for staging Auth.")
if values.get("enablePublicAccess"):
    checks = json.loads(Path("iac/stage/application-readiness.json").read_text())
    if incomplete_checks(checks):
        raise SystemExit("Public access requires all tracked application-readiness tasks to be complete.")
print("Validated stage-only infrastructure parameters.")
