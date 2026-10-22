param location string
param serverName string
param databaseName string
@allowed(['Free', 'Basic'])
param databaseTier string
param adminObjectId string
param adminName string
param tags object

resource server 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  tags: tags
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    // No SQL password and no broad firewall rule. Bootstrap the Entra group separately.
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'Group'
      login: adminName
      sid: adminObjectId
      tenantId: tenant().tenantId
      azureADOnlyAuthentication: true
    }
  }
}

var freeDatabaseProperties = {
  autoPauseDelay: 60
  minCapacity: json('0.5')
  maxSizeBytes: 34359738368
  useFreeLimit: true
  freeLimitExhaustionBehavior: 'AutoPause'
  requestedBackupStorageRedundancy: 'Local'
}
var basicDatabaseProperties = {
  maxSizeBytes: 2147483648
  requestedBackupStorageRedundancy: 'Local'
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: server
  name: databaseName
  location: location
  tags: tags
  sku: databaseTier == 'Free'
    ? {
        name: 'GP_S_Gen5'
        tier: 'GeneralPurpose'
        family: 'Gen5'
        capacity: 2
      }
    : {
        name: 'Basic'
        tier: 'Basic'
        capacity: 5
      }
  properties: databaseTier == 'Free' ? freeDatabaseProperties : basicDatabaseProperties
}

output serverName string = server.name
output serverHost string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
