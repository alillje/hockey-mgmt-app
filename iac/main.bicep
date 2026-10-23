targetScope = 'resourceGroup'

@allowed(['stage', 'prod'])
@description('Select the separate staging or production-project evaluation resources.')
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

@description('Public Supabase project URL for email authentication in this environment.')
param supabaseUrl string

@description('Browser-visible Supabase publishable API key for this environment.')
param supabasePublishableKey string

@description('Optional custom hostname accepted by the app, such as iceworkhockey.com.')
param customDomainHostName string = ''


@allowed(['B1'])
@description('B1 is the current evaluation hosting baseline for each environment.')
param planSku string = 'B1'

@description('Enable public web access only when the environment readiness review permits it.')
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
    // Read after web creation, then pass securely to the separate settings deployment.
    existingSettings: web.outputs.existingSettings
    defaultHostName: web.outputs.defaultHostName
    customDomainHostName: customDomainHostName
    databaseSecretUri: '${vault.outputs.vaultUri}secrets/${databaseSecretName}'
    applicationEnvironment: environment == 'stage' ? 'Staging' : 'Production'
    supabaseUrl: supabaseUrl
    supabasePublishableKey: supabasePublishableKey
  }
}

output webAppName string = web.outputs.webAppName
output webAppUrl string = web.outputs.webAppUrl
output runtimeIdentityObjectId string = web.outputs.runtimeIdentityObjectId
output environmentName string = environment
output keyVaultName string = keyVaultName
output databaseSecretName string = databaseSecretName
