param webAppName string
param defaultHostName string
param sqlServerHost string
param databaseName string

resource webApp 'Microsoft.Web/sites@2024-11-01' existing = {
  name: webAppName
}

// Preserve unrelated settings, including future Key Vault references.
var existingSettings = list('${webApp.id}/config/appsettings', '2024-11-01').properties

resource settings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'appsettings'
  properties: union(existingSettings, {
    Database__Provider: 'SqlServer'
    ConnectionStrings__Hockey: 'Server=tcp:${sqlServerHost},1433;Database=${databaseName};Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
    AllowedHosts: defaultHostName
  })
}
