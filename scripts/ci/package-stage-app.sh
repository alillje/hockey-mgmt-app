#!/usr/bin/env bash
# CI calls this after the frontend build and all application tests have passed.
set -euo pipefail

if [[ "${GITHUB_EVENT_NAME:-}" != "push" || "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo 'Only trusted pushes to main produce a deployment artifact.' >&2
  exit 1
fi

publish_directory='artifacts/publish'
package_directory='artifacts/stage-package'
mkdir -p "$package_directory"
test -f "$publish_directory/wwwroot/index.html"
test -f artifacts/migrations/sqlserver.sql
cp artifacts/migrations/sqlserver.sql "$package_directory/sqlserver.sql"
# The readiness report travels with the artifact, so older POC builds stay blocked.
cp iac/stage/application-readiness.json "$package_directory/application-readiness.json"
python3 - <<'PY'
import json
import os
from pathlib import Path

Path('artifacts/stage-package/release.json').write_text(json.dumps({
    'commit': os.environ['GITHUB_SHA'],
    'runId': os.environ['GITHUB_RUN_ID'],
}, indent=2) + '\n')
PY
(
  cd "$publish_directory"
  zip -qr ../stage-package/app.zip .
)
echo 'Packaged .NET and React assets; no Azure deployment was performed.'
