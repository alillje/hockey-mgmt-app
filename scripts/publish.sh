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
dotnet publish backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj \
  --configuration Release --no-restore --output artifacts/publish
dotnet ef migrations script --idempotent \
  --project backend/HockeyTrainer.Infrastructure/HockeyTrainer.Infrastructure.csproj \
  --startup-project backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj \
  --configuration Release --no-build \
  --output artifacts/migrations/postgresql.sql
dotnet ef migrations bundle --self-contained --target-runtime linux-x64 --force \
  --project backend/HockeyTrainer.Infrastructure/HockeyTrainer.Infrastructure.csproj \
  --startup-project backend/HockeyTrainer.Api/HockeyTrainer.Api.csproj \
  --configuration Release \
  --output artifacts/migrations/efbundle
# Public environment-specific database CAs travel with the reviewed build.
for certificate in backend/HockeyTrainer.Api/Certificates/supabase-*-root.crt; do
  [[ -f "$certificate" ]] || continue
  mkdir -p artifacts/publish/Certificates artifacts/migrations/Certificates
  cp "$certificate" artifacts/publish/Certificates/
  cp "$certificate" artifacts/migrations/Certificates/
done
test -f artifacts/publish/wwwroot/index.html
echo 'Published app: artifacts/publish; migration SQL and Linux EF bundle: artifacts/migrations'
