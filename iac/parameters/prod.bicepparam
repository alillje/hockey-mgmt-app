using '../main.bicep'

// FUTURE ONLY: no production workflow exists. Do not deploy this file yet.
// Confirm production pricing, isolation, backups, and readiness before connecting it.
param environment = 'prod'
param location = 'swedencentral'

// These must come from future production environment variables, never staging.
param webAppName = readEnvironmentVariable('AZURE_PROD_WEBAPP_NAME')
// Proposed production hosting baseline, subject to an approved regional quote.
param planSku = 'B1'
param enablePublicAccess = false
