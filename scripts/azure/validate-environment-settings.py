#!/usr/bin/env python3
"""Validate compiled, private Azure parameters before any deployment."""
import json
import os
import re
import sys
from pathlib import Path
from stage_readiness import incomplete_checks

if len(sys.argv) != 3 or sys.argv[1] not in {"stage", "prod"}:
    raise SystemExit("Usage: validate-environment-settings.py <stage|prod> <parameters.json>")
environment = sys.argv[1]
parameters = json.loads(Path(sys.argv[2]).read_text())["parameters"]
values = {name: parameter["value"] for name, parameter in parameters.items()}
if values.get("environment") != environment:
    raise SystemExit(f"This workflow may only use the {environment} parameter file.")
for name in ("webAppName", "location", "keyVaultName", "databaseSecretName", "databaseConnectionString", "supabaseUrl", "supabasePublishableKey"):
    if not str(values.get(name, "")).strip():
        raise SystemExit(f"Missing {environment} parameter: {name}")
if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]", values["webAppName"]):
    raise SystemExit("Use a 2–60 character web app name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]", values["keyVaultName"]):
    raise SystemExit("Use a 3–24 character Key Vault name containing letters, numbers, and internal hyphens.")
if not re.fullmatch(r"[a-zA-Z0-9-]{1,127}", values["databaseSecretName"]):
    raise SystemExit("Use a valid database secret name containing letters, numbers, or hyphens.")
project_ref = os.environ.get("SUPABASE_PROJECT_REF", "")
if not re.fullmatch(r"[a-z0-9]{20}", project_ref) or values["supabaseUrl"] != f"https://{project_ref}.supabase.co":
    raise SystemExit("The Supabase URL must match SUPABASE_PROJECT_REF.")
if not values["supabasePublishableKey"].startswith("sb_publishable_"):
    raise SystemExit("Use a Supabase publishable key for Auth.")
if environment == "prod":
    if values["webAppName"] == "hockey-mgmt-app-stage" or not values["webAppName"].endswith("-prod"):
        raise SystemExit("The production web app name must end in -prod and must not target staging.")
    if values["keyVaultName"] != "kv-hockey-prod":
        raise SystemExit("The production vault must be kv-hockey-prod.")
    if project_ref == "wbnjumvxvxwvbimqjccu":
        raise SystemExit("Production must use a separate Supabase project from staging.")
    if values.get("enablePublicAccess"):
        checks = json.loads(Path("iac/prod/application-readiness.json").read_text())
        if checks.get("temporaryProdEvaluationApproved") is not True or incomplete_checks(checks):
            raise SystemExit("Production-project public access requires the approved temporary evaluation checks.")
elif values.get("enablePublicAccess"):
    checks = json.loads(Path("iac/stage/application-readiness.json").read_text())
    if incomplete_checks(checks):
        raise SystemExit("Public access requires all tracked application-readiness tasks to be complete.")
print(f"Validated {environment} infrastructure parameters.")
