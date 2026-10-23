param webAppName string
param defaultHostName string
param databaseSecretUri string
param applicationEnvironment string
param supabaseUrl string
param supabasePublishableKey string

@secure()
@description('Existing settings read after web creation, preserving unrelated keys without logging their values.')
param existingSettings object

resource webApp 'Microsoft.Web/sites@2024-11-01' existing = {
  name: webAppName
}

resource settings 'Microsoft.Web/sites/config@2024-11-01' = {
  parent: webApp
  name: 'appsettings'
  properties: union(existingSettings, {
    Database__Provider: 'PostgreSql'
    ASPNETCORE_ENVIRONMENT: applicationEnvironment
    AllowedHosts: defaultHostName
    ConnectionStrings__Hockey: '@Microsoft.KeyVault(SecretUri=${databaseSecretUri})'
    Auth__Mode: 'Supabase'
    Auth__SupabaseUrl: supabaseUrl
    Auth__SupabasePublishableKey: supabasePublishableKey
  })
}
