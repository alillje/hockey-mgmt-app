#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/toolchain.sh"
cd "$HOCKEY_ROOT"

dotnet test HockeyTrainer.slnx
npm --prefix frontend test
npm --prefix frontend run build

if [ "${1:-}" = "--browser" ]; then
  npm --prefix frontend run test:e2e
fi
