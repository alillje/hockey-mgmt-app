"""Release provenance and promotion rules, using GitHub API fixtures only."""
import importlib.util
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("release", Path(__file__).resolve().parents[1] / "release.py")
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    repository = "alillje/hockey-mgmt-app"
    commit = "a" * 40
    digest = "sha256:" + "b" * 64

    def build(self):
        return {"commit": self.commit, "ciRunId": "123", "ciRunAttempt": 1,
                "artifactId": "456", "artifactDigest": self.digest}

    def ci_run(self):
        return {"id": 123, "status": "completed", "conclusion": "success", "event": "push",
                "head_branch": "main", "head_sha": self.commit, "run_attempt": 1,
                "path": ".github/workflows/ci.yml@refs/heads/main",
                "head_repository": {"full_name": self.repository}}

    def artifact(self):
        return {"id": 456, "name": "application", "expired": False, "digest": self.digest,
                "workflow_run": {"id": 123, "head_sha": self.commit}}

    def stage_run(self):
        return self.ci_run() | {"id": 789, "event": "workflow_dispatch", "head_sha": "c" * 40,
                                "path": ".github/workflows/release.yml"}

    def receipt(self):
        return self.build() | {"environment": "stage", "releaseRunId": "789", "releaseRunAttempt": 1}

    def api(self, endpoint):
        if "/actions/workflows/ci.yml/runs?" in endpoint:
            return {"workflow_runs": [self.ci_run()]}
        if "/actions/runs/123/artifacts?" in endpoint:
            return {"artifacts": [self.artifact()]}
        if endpoint.endswith("/actions/runs/123"):
            return self.ci_run()
        if endpoint.endswith("/actions/artifacts/456"):
            return self.artifact()
        if "/actions/artifacts?name=stage-release" in endpoint:
            return {"artifacts": [{"id": 999, "name": "stage-release", "expired": False,
                                   "workflow_run": {"id": 789}}]}
        if endpoint.endswith("/actions/runs/789"):
            return self.stage_run()
        raise AssertionError(f"Unexpected GitHub request: {endpoint}")

    def test_stage_selects_successful_push_build_for_exact_commit(self):
        with patch.object(release, "get_json", side_effect=self.api) as api:
            self.assertEqual(self.build(), release.select_stage(self.repository, self.commit))
        self.assertIn(f"head_sha={self.commit}", api.call_args_list[0].args[0])

    def test_missing_ci_or_legacy_package_blocks_release(self):
        with patch.object(release, "get_json", return_value={"workflow_runs": []}):
            with self.assertRaisesRegex(SystemExit, "Wait for CI"):
                release.select_stage(self.repository, self.commit)
        with patch.object(release, "get_json", side_effect=self.api), patch.object(release, "pages", return_value=[]):
            with self.assertRaisesRegex(SystemExit, "one application package"):
                release.select_stage(self.repository, self.commit)

    def test_forks_pull_requests_manual_ci_wrong_workflow_and_stale_commit_are_rejected(self):
        for change in ({"event": "pull_request"}, {"event": "workflow_dispatch"}, {"head_branch": "feature"},
                       {"head_sha": "d" * 40}, {"path": ".github/workflows/other.yml"},
                       {"head_repository": {"full_name": "someone/else"}}, {"conclusion": "failure"}):
            with self.subTest(change=change), patch.object(release, "get_json", return_value=self.ci_run() | change):
                with self.assertRaises(SystemExit):
                    release.verify_application(self.repository, self.build())

    def test_expired_replaced_or_wrong_build_artifacts_are_rejected(self):
        for change in ({"expired": True}, {"digest": "sha256:" + "e" * 64}, {"name": "another-package"},
                       {"workflow_run": {"id": 124, "head_sha": self.commit}},
                       {"workflow_run": {"id": 123, "head_sha": "d" * 40}}):
            def api(endpoint):
                return self.artifact() | change if "/actions/artifacts/456" in endpoint else self.api(endpoint)
            with self.subTest(change=change), patch.object(release, "get_json", side_effect=api):
                with self.assertRaises(SystemExit):
                    release.verify_application(self.repository, self.build())

    def test_rerunning_ci_requires_another_stage_deployment(self):
        with patch.object(release, "get_json", return_value=self.ci_run() | {"run_attempt": 2}):
            with self.assertRaisesRegex(SystemExit, "rerun"):
                release.verify_application(self.repository, self.build())

    def test_prod_promotes_exact_stage_package_even_when_main_has_moved(self):
        with patch.object(release, "get_json", side_effect=self.api), patch.object(
                release, "read_stage_receipt", return_value=self.receipt()):
            self.assertEqual(self.build() | {"stageReleaseRunId": "789"}, release.select_production(self.repository))

    def test_failed_incomplete_and_other_workflow_records_cannot_authorise_prod(self):
        for change in ({"conclusion": "failure"}, {"conclusion": "cancelled"}, {"status": "in_progress"},
                       {"path": ".github/workflows/unrelated.yml"}):
            def api(endpoint):
                return self.stage_run() | change if endpoint.endswith("/actions/runs/789") else self.api(endpoint)
            with self.subTest(change=change), patch.object(release, "get_json", side_effect=api):
                with self.assertRaisesRegex(SystemExit, "Deploy to stage first"):
                    release.select_production(self.repository)

    def test_prod_rejects_mismatched_environment_run_attempt_or_run_id_in_receipt(self):
        for change in ({"environment": "prod"}, {"releaseRunId": "790"}, {"releaseRunAttempt": 2},
                       {"artifactDigest": "sha256:" + "f" * 64}):
            with self.subTest(change=change), patch.object(release, "get_json", side_effect=self.api), patch.object(
                    release, "read_stage_receipt", return_value=self.receipt() | change):
                with self.assertRaises(SystemExit):
                    release.select_production(self.repository)

    def test_expired_latest_stage_record_blocks_instead_of_falling_back(self):
        artifacts = [{"id": 999, "name": "stage-release", "expired": True, "workflow_run": {"id": 789}},
                     {"id": 998, "name": "stage-release", "expired": False, "workflow_run": {"id": 788}}]
        with patch.object(release, "get_json", side_effect=self.api), patch.object(
                release, "pages", return_value=artifacts), patch.object(release, "read_stage_receipt") as receipt:
            with self.assertRaisesRegex(SystemExit, "expired"):
                release.select_production(self.repository)
            receipt.assert_not_called()

    def test_package_commit_attempt_and_required_files_match_selected_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            metadata = {"commit": self.commit, "runId": "123", "runAttempt": "1"}
            for name in ("app.zip", "efbundle", "postgresql.sql"):
                (directory / name).write_text("fixture")
            (directory / "release.json").write_text(json.dumps(metadata))
            release.verify_package(self.build(), directory)
            for change in ({"commit": "d" * 40}, {"runId": "124"}, {"runAttempt": "2"}):
                (directory / "release.json").write_text(json.dumps(metadata | change))
                with self.subTest(change=change), self.assertRaises(SystemExit):
                    release.verify_package(self.build(), directory)
            (directory / "release.json").write_text(json.dumps(metadata))
            (directory / "postgresql.sql").unlink()
            with self.assertRaisesRegex(SystemExit, "missing postgresql.sql"):
                release.verify_package(self.build(), directory)

    def test_artifact_search_follows_pagination(self):
        with patch.object(release, "get_json", side_effect=[{"artifacts": list(range(100))}, {"artifacts": [100]}]) as api:
            self.assertEqual(list(range(101)), list(release.pages("repos/example/artifacts?name=stage-release", "artifacts")))
            self.assertIn("&per_page=100&page=2", api.call_args.args[0])

    def test_reads_stage_receipt_from_archive_without_extracting_files(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as package:
            package.writestr("stage-release.json", json.dumps(self.receipt()))
        with patch.object(release.subprocess, "check_output", return_value=archive.getvalue()):
            self.assertEqual(self.receipt(), release.read_stage_receipt(self.repository, 999))

    def test_selection_writes_one_pinned_build_to_job_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "output"
            summary = Path(temporary) / "summary"
            with patch.dict(os.environ, {
                "GITHUB_REPOSITORY": self.repository, "HOCKEY_DEPLOY_ENVIRONMENT": "prod",
                "GITHUB_REF": "refs/heads/main", "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(summary),
            }), patch("sys.argv", ["release.py", "select"]), patch.object(
                    release, "select_production", return_value=self.build() | {"stageReleaseRunId": "789"}):
                release.main()
            self.assertIn(f"commit={self.commit}", output.read_text())
            selected = json.loads(output.read_text().splitlines()[0].removeprefix("release="))
            self.assertEqual("456", selected["artifactId"])
            self.assertIn("/actions/runs/789", summary.read_text())

    def test_main_rejects_unknown_environment_and_non_main_before_any_api_call(self):
        for environment, branch in (("other", "refs/heads/main"), ("stage", "refs/heads/feature")):
            with self.subTest(environment=environment, branch=branch), patch.dict(os.environ, {
                "GITHUB_REPOSITORY": self.repository, "HOCKEY_DEPLOY_ENVIRONMENT": environment, "GITHUB_REF": branch,
            }), patch("sys.argv", ["release.py", "select"]), patch.object(release, "get_json") as api:
                with self.assertRaises(SystemExit):
                    release.main()
                api.assert_not_called()


if __name__ == "__main__":
    unittest.main()
