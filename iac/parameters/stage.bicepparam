using '../main.bicep'

// Staging is the only environment connected to GitHub deployment workflows.
param environment = 'stage'
param location = 'swedencentral'

// Identifiers come from GitHub variables; none of these values is a secret.
param webAppName = readEnvironmentVariable('AZURE_WEBAPP_NAME')
// Approved B1 hosting baseline.
param planSku = 'B1'
param enablePublicAccess = readEnvironmentVariable('STAGE_PUBLIC_ACCESS_ENABLED', 'false') == 'true'
