#!/usr/bin/env bash
# Build frontend first: npm --prefix frontend run build
# This command packages files and generates SQL; it never connects to Azure or applies migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f frontend/dist/index.html ]]; then
  echo 'Build React first: npm --prefix frontend run build' >&2
  exit 1
fi

# These directories contain generated output only. Never remove persisted app data.
rm -rf -- artifacts/publish artifacts/migrations
mkdir -p artifacts/publish artifacts/migrations
dotnet publish backend/HockeyTrainer.Api.csproj \
  --configuration Release --no-restore --output artifacts/publish
dotnet ef migrations script --idempotent \
  --project backend/HockeyTrainer.Api.csproj --configuration Release --no-build \
  --output artifacts/migrations/postgresql.sql
dotnet ef migrations bundle --self-contained --target-runtime linux-x64 --force \
  --project backend/HockeyTrainer.Api.csproj --configuration Release \
  --output artifacts/migrations/efbundle
# The database CA certificate is public and travels with the reviewed build.
if [[ -f backend/Certificates/supabase-root.crt ]]; then
  mkdir -p artifacts/publish/Certificates artifacts/migrations/Certificates
  cp backend/Certificates/supabase-root.crt artifacts/publish/Certificates/supabase-root.crt
  cp backend/Certificates/supabase-root.crt artifacts/migrations/Certificates/supabase-root.crt
fi
test -f artifacts/publish/wwwroot/index.html
echo 'Published app: artifacts/publish; migration SQL and Linux EF bundle: artifacts/migrations'
