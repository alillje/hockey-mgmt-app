#!/usr/bin/env bash
# One-time subscription bootstrap, run as a subscription administrator after az login.
set -euo pipefail
cd "$(dirname "$0")/../.."

subscription_id="${AZURE_SUBSCRIPTION_ID:-}"
if [[ -z "$subscription_id" ]]; then
  subscription_id=$(gh variable get AZURE_SUBSCRIPTION_ID --env stage)
fi
az account set --subscription "$subscription_id"
for provider in Microsoft.Web Microsoft.Sql Microsoft.KeyVault Microsoft.ManagedIdentity Microsoft.Network; do
  az provider register --namespace "$provider" --wait --output none
done
echo 'Registered the staging subscription resource providers. No application resources were created.'
