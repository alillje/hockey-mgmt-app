targetScope = 'resourceGroup'

@allowed(['stage', 'prod'])
@description('Only stage is connected to deployment workflows. Production requires a separate launch decision.')
param environment string

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Globally unique name of the environment web app.')
param webAppName string

@description('Object ID of the Entra group responsible for SQL administration; not an application client ID.')
param sqlAdminObjectId string

@description('Display name of the SQL administrator group.')
param sqlAdminName string

@allowed(['B1'])
@description('B1 is the approved stage baseline: VNet integration requires paid dedicated compute.')
param planSku string = 'B1'

@allowed(['Free', 'Basic'])
@description('Free pauses at its monthly limit. Basic is a paid fallback with a 2 GB limit.')
param databaseTier string = 'Free'

@description('Keep public web access disabled until authentication and hosted persistence are ready.')
param enablePublicAccess bool = false

var resourceSuffix = uniqueString(resourceGroup().id)
var tags = {
  application: 'hockey-mgmt-app'
  environment: environment
  managedBy: 'bicep'
}

module database 'modules/database.bicep' = {
  name: '${environment}-database'
  params: {
    location: location
    serverName: 'sql-hockey-${environment}-${resourceSuffix}'
    databaseName: 'hockey-${environment}'
    databaseTier: databaseTier
    adminObjectId: sqlAdminObjectId
    adminName: sqlAdminName
    tags: tags
  }
}

module web 'modules/web.bicep' = {
  name: '${environment}-web-app'
  params: {
    location: location
    webAppName: webAppName
    planName: 'asp-hockey-${environment}'
    planSku: planSku
    enablePublicAccess: enablePublicAccess
    tags: tags
    integrationSubnetId: network.outputs.integrationSubnetId
  }
}

module vault 'modules/vault.bicep' = {
  name: '${environment}-secrets-vault'
  params: {
    location: location
    vaultName: 'kv-hockey-${resourceSuffix}'
    tags: tags
  }
}

module databaseAccess 'modules/database-access.bicep' = {
  name: '${environment}-database-access'
  params: {
    serverName: database.outputs.serverName
    integrationSubnetId: network.outputs.integrationSubnetId
  }
}

module network 'modules/network.bicep' = {
  name: '${environment}-network'
  params: {
    location: location
    networkName: 'vnet-hockey-${environment}'
    tags: tags
  }
}

module applicationSettings 'modules/application-settings.bicep' = {
  name: '${environment}-application-settings'
  params: {
    webAppName: web.outputs.webAppName
    defaultHostName: web.outputs.defaultHostName
    sqlServerHost: database.outputs.serverHost
    databaseName: database.outputs.databaseName
  }
}

output webAppName string = web.outputs.webAppName
output webAppUrl string = web.outputs.webAppUrl
output runtimeIdentityObjectId string = web.outputs.runtimeIdentityObjectId
output sqlServerName string = database.outputs.serverName
output sqlServerHost string = database.outputs.serverHost
output databaseName string = database.outputs.databaseName
output keyVaultName string = vault.outputs.vaultName
output environmentName string = environment
