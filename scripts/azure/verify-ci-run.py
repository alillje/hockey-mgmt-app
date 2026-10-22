#!/usr/bin/env python3
"""Accept only successful push-to-main CI runs from this repository."""
import json
import os
import subprocess
from pathlib import Path

run_id = os.environ.get("CI_RUN_ID", "")
if not run_id.isdecimal():
    raise SystemExit("CI run ID must be a numeric GitHub Actions run ID.")
repository = os.environ["GITHUB_REPOSITORY"]
run = json.loads(subprocess.check_output(
    ["gh", "api", f"repos/{repository}/actions/runs/{run_id}"], text=True,
))
expected = {
    "conclusion": "success",
    "status": "completed",
    "event": "push",
    "head_branch": "main",
    "path": ".github/workflows/ci.yml",
}
for key, value in expected.items():
    if run.get(key) != value:
        raise SystemExit(f"Run {run_id} is not a trusted successful main CI run: {key}.")
if run.get("head_repository", {}).get("full_name") != repository:
    raise SystemExit("The CI artifact must come from this repository.")
Path("artifacts").mkdir(exist_ok=True)
Path("artifacts/expected-release.json").write_text(json.dumps({
    "commit": run["head_sha"], "runId": run_id,
}))
print(f"Verified CI run {run_id} for commit {run['head_sha']}.")
