#!/usr/bin/env bash
# Run once as an existing Entra SQL administrator after az login.
# Reuses the existing deployment identity; no new identity or secret is created.
set -euo pipefail
cd "$(dirname "$0")/../.."

for variable in AZURE_CLIENT_ID AZURE_SUBSCRIPTION_ID AZURE_RESOURCE_GROUP AZURE_WEBAPP_NAME; do
  if [[ -z "${!variable:-}" ]]; then
    value=$(gh variable get "$variable" --env stage)
    export "$variable=$value"
  fi
done
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

target='artifacts/azure/bootstrap-target.json'
lease='artifacts/azure/bootstrap-firewall.json'
python3 scripts/azure/database.py discover "$target"
dotnet build tools/HockeyTrainer.Database/HockeyTrainer.Database.csproj --configuration Release
dotnet run --project tools/HockeyTrainer.Database --configuration Release --no-build -- preview-bootstrap "$target"

trap 'exit 130' INT
trap 'exit 143' TERM
trap 'python3 scripts/azure/database.py firewall-remove "$target" "$lease"' EXIT
python3 scripts/azure/database.py firewall-add "$target" "$lease"
az webapp stop --resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_WEBAPP_NAME"
state=$(az webapp show --resource-group "$AZURE_RESOURCE_GROUP" --name "$AZURE_WEBAPP_NAME" --query state --output tsv)
[[ "$state" == 'Stopped' ]] || { echo 'App must be stopped before initial database setup.' >&2; exit 1; }
dotnet run --project tools/HockeyTrainer.Database --configuration Release --no-build -- bootstrap "$target"
