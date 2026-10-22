#!/usr/bin/env bash
# Build frontend first: npm --prefix frontend run build
# This command packages files and generates SQL; it never connects to Azure or applies migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f frontend/dist/index.html ]]; then
  echo 'Build React first: npm --prefix frontend run build' >&2
  exit 1
fi

mkdir -p artifacts/publish artifacts/migrations
dotnet publish backend/HockeyTrainer.Api.csproj \
  --configuration Release --no-restore --output artifacts/publish
dotnet ef migrations script --idempotent \
  --project backend/HockeyTrainer.Api.csproj --configuration Release --no-build \
  --output artifacts/migrations/sqlserver.sql
test -f artifacts/publish/wwwroot/index.html
echo 'Published application: artifacts/publish; review-only SQL: artifacts/migrations/sqlserver.sql'
