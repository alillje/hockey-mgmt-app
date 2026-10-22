param webAppName string
param defaultHostName string

@secure()
@description('Existing settings read by the parent deployment, preserving unrelated keys without logging their values.')
param existingSettings object

resource webApp 'Microsoft.Web/sites@2024-11-01' existing = {
  name: webAppName
}

resource settings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'appsettings'
  properties: union(existingSettings, {
    Database__Provider: 'PostgreSql'
    AllowedHosts: defaultHostName
  })
}
