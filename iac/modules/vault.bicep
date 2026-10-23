param name string
param location string
param tags object
param runtimePrincipalId string
param databaseSecretName string

@secure()
param databaseConnectionString string

resource vault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: name
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    // App Service resolves its reference using this identity. ARM creates the secret.
    enableRbacAuthorization: false
    publicNetworkAccess: 'Enabled'
    accessPolicies: [
      {
        tenantId: tenant().tenantId
        objectId: runtimePrincipalId
        permissions: {
          secrets: ['get']
        }
      }
    ]
  }
}

resource databaseSecret 'Microsoft.KeyVault/vaults/secrets@2024-11-01' = {
  parent: vault
  name: databaseSecretName
  properties: {
    value: databaseConnectionString
    contentType: 'Npgsql connection string'
  }
}

output vaultUri string = vault.properties.vaultUri
