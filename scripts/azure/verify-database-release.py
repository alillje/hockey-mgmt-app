#!/usr/bin/env python3
"""Apply SQL only from a trusted CI artifact matching this reviewed main commit."""
import json
import os
from pathlib import Path

expected = json.loads(Path("artifacts/expected-release.json").read_text())
actual = json.loads(Path("artifacts/stage-package/release.json").read_text())
if actual != expected or actual["commit"] != os.environ["GITHUB_SHA"]:
    raise SystemExit("Select the successful push-to-main CI run matching the current main commit.")
if not Path("artifacts/stage-package/postgresql.sql").is_file():
    raise SystemExit("The trusted CI artifact must include reviewed SQL.")
print("Database artifact metadata matches the current reviewed main commit.")
