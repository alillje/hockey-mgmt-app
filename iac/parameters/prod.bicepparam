using '../main.bicep'

// FUTURE ONLY: no production workflow exists. Do not deploy this file yet.
// Confirm production pricing, isolation, backups, and readiness before connecting it.
param environment = 'prod'
param location = 'swedencentral'

// These must come from future production environment variables, never staging.
param webAppName = readEnvironmentVariable('AZURE_PROD_WEBAPP_NAME')
param sqlAdminObjectId = readEnvironmentVariable('AZURE_PROD_SQL_ADMIN_OBJECT_ID')
param sqlAdminName = readEnvironmentVariable('AZURE_PROD_SQL_ADMIN_NAME')

// Proposed paid production baseline, subject to an approved regional quote.
param planSku = 'B1'
param databaseTier = 'Basic'
param enablePublicAccess = false
