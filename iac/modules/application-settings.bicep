param webAppName string
param defaultHostName string
param sqlServerHost string
param databaseName string

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
    Database__Provider: 'SqlServer'
    ConnectionStrings__Hockey: 'Server=tcp:${sqlServerHost},1433;Database=${databaseName};Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
    AllowedHosts: defaultHostName
  })
}
