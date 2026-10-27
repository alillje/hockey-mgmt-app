#!/usr/bin/env python3
"""Select trusted builds, verify packages, and record successful deployments."""
import argparse
import io
import json
import os
import re
import subprocess
import zipfile
from pathlib import Path


def get_json(endpoint):
    return json.loads(subprocess.check_output(["gh", "api", endpoint], text=True))


def pages(endpoint, key):
    page = 1
    while True:
        separator = "&" if "?" in endpoint else "?"
        items = get_json(f"{endpoint}{separator}per_page=100&page={page}")[key]
        yield from items
        if len(items) < 100:
            return
        page += 1


def verify_run(run, repository, workflow, event, commit=None):
    expected = {"status": "completed", "conclusion": "success", "event": event, "head_branch": "main"}
    if commit is not None:
        expected["head_sha"] = commit
    if any(run.get(key) != value for key, value in expected.items()):
        raise SystemExit("Release requires a successful, completed main-branch workflow run.")
    if run.get("path", "").split("@", 1)[0] != f".github/workflows/{workflow}":
        raise SystemExit("Release artifact came from the wrong workflow.")
    if run.get("head_repository", {}).get("full_name") != repository:
        raise SystemExit("Release artifact must originate in this repository.")


def verify_application(repository, release):
    """Revalidate the exact immutable artifact, including during promotion."""
    if not re.fullmatch(r"[0-9a-f]{40}", release.get("commit", "")):
        raise SystemExit("Release commit must be a full commit SHA.")
    for key in ("ciRunId", "ciRunAttempt", "artifactId"):
        if not str(release.get(key, "")).isdecimal() or int(release[key]) < 1:
            raise SystemExit(f"Invalid release identifier: {key}.")
    digest = release.get("artifactDigest")
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise SystemExit("Release requires the application artifact's SHA-256 digest.")
    run = get_json(f"repos/{repository}/actions/runs/{release['ciRunId']}")
    verify_run(run, repository, "ci.yml", "push", release["commit"])
    if run["run_attempt"] != int(release["ciRunAttempt"]):
        raise SystemExit("The build was rerun. Deploy the new build to stage before promoting it.")
    artifact = get_json(f"repos/{repository}/actions/artifacts/{release['artifactId']}")
    if artifact.get("expired"):
        raise SystemExit("The application package has expired. Build and release to stage again.")
    if (artifact.get("name") != "application"
            or artifact.get("workflow_run", {}).get("id") != int(release["ciRunId"])
            or artifact.get("workflow_run", {}).get("head_sha") != release["commit"]
            or artifact.get("digest") != release["artifactDigest"]):
        raise SystemExit("Application artifact provenance or digest does not match the selected release.")


def select_stage(repository, commit):
    endpoint = (f"repos/{repository}/actions/workflows/ci.yml/runs"
                f"?branch=main&event=push&status=success&head_sha={commit}&per_page=1")
    runs = get_json(endpoint).get("workflow_runs", [])
    if not runs:
        raise SystemExit("No successful CI build exists for this main commit. Wait for CI to finish.")
    run = runs[0]
    verify_run(run, repository, "ci.yml", "push", commit)
    artifacts = [artifact for artifact in pages(
        f"repos/{repository}/actions/runs/{run['id']}/artifacts", "artifacts")
        if artifact["name"] == "application"]
    if len(artifacts) != 1:
        raise SystemExit("Expected one application package. Push a new build using the current CI workflow.")
    artifact = artifacts[0]
    release = {"commit": commit, "ciRunId": str(run["id"]), "ciRunAttempt": run["run_attempt"],
               "artifactId": str(artifact["id"]), "artifactDigest": artifact.get("digest")}
    verify_application(repository, release)
    return release


def read_stage_receipt(repository, artifact_id):
    archive = subprocess.check_output([
        "gh", "api", f"repos/{repository}/actions/artifacts/{artifact_id}/zip"])
    with zipfile.ZipFile(io.BytesIO(archive)) as package:
        entry = package.getinfo("stage-release.json")
        if entry.file_size > 65536:
            raise SystemExit("Unexpectedly large stage release record.")
        return json.loads(package.read(entry))


def select_production(repository):
    # The artifact API returns newest first. Never fall back from an expired or
    # invalid successful stage record to an older application package.
    for artifact in pages(f"repos/{repository}/actions/artifacts?name=stage-release", "artifacts"):
        if artifact.get("name") != "stage-release":
            continue
        run_id = artifact.get("workflow_run", {}).get("id")
        run = get_json(f"repos/{repository}/actions/runs/{run_id}")
        if run.get("path", "").split("@", 1)[0] != ".github/workflows/release.yml":
            continue
        if run.get("status") != "completed" or run.get("conclusion") != "success":
            continue
        verify_run(run, repository, "release.yml", "workflow_dispatch")
        if artifact.get("expired"):
            raise SystemExit("The last successful stage record expired. Release to stage again first.")
        receipt = read_stage_receipt(repository, artifact["id"])
        if (receipt.get("environment") != "stage" or receipt.get("releaseRunId") != str(run_id)
                or receipt.get("releaseRunAttempt") != run["run_attempt"]):
            raise SystemExit("Stage record does not match its successful deployment run.")
        release = {key: receipt[key] for key in (
            "commit", "ciRunId", "ciRunAttempt", "artifactId", "artifactDigest")}
        verify_application(repository, release)
        release["stageReleaseRunId"] = str(run_id)
        return release
    raise SystemExit("No successful stage release exists for this workflow. Deploy to stage first.")


def verify_package(release, directory):
    expected = {"commit": release["commit"], "runId": release["ciRunId"],
                "runAttempt": str(release["ciRunAttempt"])}
    actual = json.loads((directory / "release.json").read_text())
    if actual != expected:
        raise SystemExit("Package metadata does not match the selected build. Re-run all CI jobs or push a new commit, then release to stage.")
    for name in ("app.zip", "efbundle", "postgresql.sql"):
        if not (directory / name).is_file():
            raise SystemExit(f"Application package is missing {name}.")


def write_summary(environment, release):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    repository = os.environ["GITHUB_REPOSITORY"]
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    with open(path, "a", encoding="utf-8") as summary:
        summary.write(f"## Release to {environment}\n\nCommit: `{release['commit']}`\n\n")
        summary.write(f"[CI build]({server}/{repository}/actions/runs/{release['ciRunId']}) · "
                      f"Package ID: `{release['artifactId']}`\n\n")
        if stage_run := release.get("stageReleaseRunId"):
            summary.write(f"[Verified stage release]({server}/{repository}/actions/runs/{stage_run})\n\n")
        summary.write("Selection is fixed for this run. Deployment and verification results appear below.\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("select", "verify-package", "record"))
    arguments = parser.parse_args()
    repository = os.environ["GITHUB_REPOSITORY"]
    environment = os.environ["HOCKEY_DEPLOY_ENVIRONMENT"]
    if environment not in {"stage", "prod"} or os.environ["GITHUB_REF"] != "refs/heads/main":
        raise SystemExit("Releases require main and a stage or prod destination.")
    if arguments.command == "select":
        release = select_stage(repository, os.environ["GITHUB_SHA"]) if environment == "stage" else select_production(repository)
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"release={json.dumps(release)}\ncommit={release['commit']}\n")
        write_summary(environment, release)
    else:
        release = json.loads(os.environ["SELECTED_RELEASE_JSON"])
        verify_application(repository, release)
        verify_package(release, Path("artifacts/application"))
        if arguments.command == "record":
            receipt = release | {"environment": environment, "releaseRunId": os.environ["GITHUB_RUN_ID"],
                                 "releaseRunAttempt": int(os.environ["GITHUB_RUN_ATTEMPT"])}
            Path("artifacts").mkdir(exist_ok=True)
            Path(f"artifacts/{environment}-release.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
