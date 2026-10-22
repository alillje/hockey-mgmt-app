using '../main.bicep'

// Staging is the only environment connected to GitHub deployment workflows.
param environment = 'stage'
param location = 'swedencentral'

// Identifiers come from GitHub variables; none of these values is a secret.
param webAppName = readEnvironmentVariable('AZURE_WEBAPP_NAME')
param sqlAdminObjectId = readEnvironmentVariable('AZURE_SQL_ADMIN_OBJECT_ID')
param sqlAdminName = readEnvironmentVariable('AZURE_SQL_ADMIN_NAME')

// Review a PR and the regional quote before switching to a paid SKU.
param planSku = 'F1'
param databaseTier = 'Free'
param enablePublicAccess = readEnvironmentVariable('STAGE_PUBLIC_ACCESS_ENABLED', 'false') == 'true'
