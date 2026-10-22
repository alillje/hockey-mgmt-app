param location string
param vaultName string
param tags object

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 7
    // Access still requires explicit RBAC. No secrets or role assignments are deployed here.
    publicNetworkAccess: 'Enabled'
  }
}

output vaultName string = vault.name
