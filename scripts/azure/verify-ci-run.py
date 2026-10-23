#!/usr/bin/env python3
"""Select and verify the successful push-to-main CI build for this commit."""
import json
import os
import subprocess
from pathlib import Path


def get_json(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))


def current_main_ci_run(repository, commit):
    endpoint = (f"repos/{repository}/actions/workflows/ci.yml/runs"
                f"?branch=main&event=push&status=success&head_sha={commit}&per_page=1")
    runs = get_json(endpoint).get("workflow_runs", [])
    if not runs:
        raise SystemExit("No successful push-to-main CI build exists for the current commit. Wait for CI to finish.")
    return str(runs[0]["id"])


def verify_ci_run(run, run_id, repository, commit):
    expected = {
        "conclusion": "success",
        "status": "completed",
        "event": "push",
        "head_branch": "main",
        "head_sha": commit,
    }
    for key, value in expected.items():
        if run.get(key) != value:
            raise SystemExit(f"Run {run_id} is not a trusted successful current-main CI run: {key}.")
    if run.get("path", "").split("@", 1)[0] != ".github/workflows/ci.yml":
        raise SystemExit("The selected build did not run the CI workflow.")
    if run.get("head_repository", {}).get("full_name") != repository:
        raise SystemExit("The CI artifact must come from this repository.")


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    commit = os.environ["GITHUB_SHA"]
    run_id = os.environ.get("CI_RUN_ID") or current_main_ci_run(repository, commit)
    if not run_id.isdecimal():
        raise SystemExit("CI run ID must be numeric.")
    run = get_json(f"repos/{repository}/actions/runs/{run_id}")
    verify_ci_run(run, run_id, repository, commit)
    Path("artifacts").mkdir(exist_ok=True)
    Path("artifacts/expected-release.json").write_text(json.dumps({
        "commit": commit, "runId": run_id,
    }))
    if output_path := os.environ.get("GITHUB_OUTPUT"):
        with open(output_path, "a", encoding="utf-8") as output:
            output.write(f"ci_run_id={run_id}\n")
    print(f"Selected successful CI run {run_id} for current main commit {commit}.")


if __name__ == "__main__":
    main()
