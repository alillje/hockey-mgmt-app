#!/usr/bin/env python3
"""Run the published React/.NET application with an isolated SQLite database."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def check_security_headers(headers):
    policy = headers.get("Content-Security-Policy", "")
    assert "script-src 'self'" in policy, "Missing enforced script policy"
    assert "frame-ancestors 'none'" in policy, "Missing frame restriction"
    assert "'unsafe-eval'" not in policy, "Script evaluation must stay disabled"
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"


def request(path):
    try:
        with urlopen(f"http://127.0.0.1:5281{path}", timeout=5) as response:
            check_security_headers(response.headers)
            return response.status, response.headers.get_content_type(), response.read().decode()
    except HTTPError as error:
        check_security_headers(error.headers)
        return error.code, error.headers.get_content_type(), error.read().decode()


publish_directory = Path("artifacts/publish").resolve()
with tempfile.TemporaryDirectory(prefix="hockey-publish-") as temporary:
    environment = os.environ.copy()
    environment.update({
        "Database__Provider": "Sqlite",
        "DatabasePath": str(Path(temporary) / "smoke.db"),
        "AllowedHosts": "localhost;127.0.0.1",
        "ASPNETCORE_ENVIRONMENT": "Production",
        "Auth__Mode": "Supabase",
        "Auth__Session__KeyRingPath": str(Path(temporary) / "session-keys"),
        "Auth__SupabaseUrl": "https://hockey-ci.supabase.co",
        "Auth__SupabasePublishableKey": "sb_publishable_ci-only",
    })
    with open(Path(temporary) / "server.log", "w+") as log:
        application = subprocess.Popen(
            ["dotnet", "HockeyTrainer.Api.dll", "--urls", "http://127.0.0.1:5281"],
            cwd=publish_directory, env=environment, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            for attempt in range(60):
                if application.poll() is not None:
                    raise RuntimeError("Published app exited during startup")
                try:
                    if request("/api/health")[0] == 200:
                        break
                except (URLError, TimeoutError):
                    pass
                time.sleep(0.5)
            else:
                raise RuntimeError("Published app did not become healthy")

            status, content_type, html = request("/")
            assert status == 200 and content_type == "text/html" and 'id="root"' in html
            for path in ("/drills/new", "/practices/all?search=skating"):
                assert request(path) == (200, content_type, html), path
            assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', html)
            assert assets, "Published entry page must reference built assets"
            for path in assets:
                assert request(path)[0] == 200, path
            assert request("/api/readiness")[0] == 200
            assert request("/api/auth/config")[0] == 200
            assert request("/api/drills")[0] == 401
            for path in ("/api", "/api/unknown", "/assets/missing.js"):
                status, _, body = request(path)
                assert status == 404 and 'id="root"' not in body, path
            print("Published app passed: React routes/assets, Auth protection, API health/readiness, and 404 responses.")
        except Exception:
            log.flush()
            log.seek(0)
            print(log.read())
            raise
        finally:
            application.terminate()
            try:
                application.wait(timeout=10)
            except subprocess.TimeoutExpired:
                application.kill()
                application.wait()
