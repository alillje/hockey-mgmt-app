targetScope = 'resourceGroup'

@allowed(['stage', 'prod'])
@description('Only stage is connected to deployment workflows. Production requires a separate launch decision.')
param environment string

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Globally unique name of the environment web app.')
param webAppName string

@minLength(3)
@maxLength(24)
@description('Globally unique, human-readable Key Vault name; configured per environment.')
param keyVaultName string

@secure()
@description('Npgsql database connection from the environment GitHub secret. Never output this value.')
param databaseConnectionString string

@description('Name of the vault secret populated from the GitHub database secret.')
param databaseSecretName string = 'supabase-db-connection'

@allowed(['B1'])
@description('B1 is the approved stage hosting baseline.')
param planSku string = 'B1'

@description('Keep public web access disabled until authentication and hosted persistence are ready.')
param enablePublicAccess bool = false

var tags = {
  application: 'hockey-mgmt-app'
  environment: environment
  managedBy: 'bicep'
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
  }
}

module vault 'modules/vault.bicep' = {
  name: '${environment}-key-vault'
  params: {
    name: keyVaultName
    location: location
    tags: tags
    runtimePrincipalId: web.outputs.runtimeIdentityObjectId
    databaseSecretName: databaseSecretName
    databaseConnectionString: databaseConnectionString
  }
}

module applicationSettings 'modules/application-settings.bicep' = {
  name: '${environment}-application-settings'
  params: {
    webAppName: web.outputs.webAppName
    // Read in the parent deployment; reading inside the settings module creates a self-dependency.
    existingSettings: list(resourceId('Microsoft.Web/sites/config', webAppName, 'appsettings'), '2024-11-01').properties
    defaultHostName: web.outputs.defaultHostName
    databaseSecretUri: '${vault.outputs.vaultUri}secrets/${databaseSecretName}'
    applicationEnvironment: environment == 'stage' ? 'Staging' : 'Production'
  }
}

output webAppName string = web.outputs.webAppName
output webAppUrl string = web.outputs.webAppUrl
output runtimeIdentityObjectId string = web.outputs.runtimeIdentityObjectId
output environmentName string = environment
output keyVaultName string = keyVaultName
output databaseSecretName string = databaseSecretName
