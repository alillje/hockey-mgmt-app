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
dotnet ef migrations bundle --self-contained --target-runtime linux-x64 --force \
  --project backend/HockeyTrainer.Api.csproj --configuration Release \
  --output artifacts/migrations/efbundle
test -f artifacts/publish/wwwroot/index.html
echo 'Published app: artifacts/publish; migration SQL and Linux EF bundle: artifacts/migrations'
