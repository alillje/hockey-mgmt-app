#!/usr/bin/env python3
"""Check Azure CLI runtime JSON from both older and structured-output releases."""
import json
import sys
from pathlib import Path

required_runtime = "DOTNETCORE|10.0"
report = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("artifacts/azure/linux-runtimes.json")
try:
    entries = json.loads(report.read_text())
except (OSError, ValueError) as error:
    raise SystemExit(f"Could not read Azure's Linux runtime list: {error}")
if not isinstance(entries, list):
    raise SystemExit("Expected Azure CLI to return a JSON array of Linux runtimes.")

runtimes = []
for entry in entries:
    if isinstance(entry, str):
        identifier = entry
    elif isinstance(entry, dict):
        # Current Azure CLI returns os/runtime/version/config/support/end_of_life.
        if str(entry.get("os", "linux")).lower() != "linux":
            continue
        identifier = entry.get("config", "")
    else:
        continue
    if isinstance(identifier, str):
        runtimes.append(identifier.strip().upper().replace(":", "|"))

if required_runtime not in runtimes:
    available = ", ".join(value for value in runtimes if value.startswith("DOTNET")) or "none"
    raise SystemExit(
        f"Azure did not list {required_runtime} for Linux. Available .NET identifiers: {available}. "
        f"Review the complete response in {report}; the infrastructure preview has not run."
    )
print(f"Azure lists the required Linux runtime: {required_runtime}.")
