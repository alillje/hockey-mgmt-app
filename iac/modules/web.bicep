param location string
param webAppName string
param planName string
@allowed(['B1'])
param planSku string
param enablePublicAccess bool
param tags object

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: planName
  location: location
  kind: 'linux'
  tags: tags
  sku: {
    name: planSku
    tier: 'Basic'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: enablePublicAccess ? 'Enabled' : 'Disabled'
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      // The separate application-settings module merges settings, preserving unrelated keys.
    }
  }
}

resource publishingCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'scm'
  properties: {
    allow: false
  }
}

resource ftpCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: webApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

output webAppName string = webApp.name
output webAppUrl string = 'https://${webApp.properties.defaultHostName}'
output runtimeIdentityObjectId string = webApp.identity.principalId
output defaultHostName string = webApp.properties.defaultHostName
