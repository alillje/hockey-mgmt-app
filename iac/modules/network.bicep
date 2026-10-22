param location string
param networkName string
param tags object

resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: networkName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: ['10.60.0.0/16']
    }
    subnets: [
      {
        name: 'app-integration'
        properties: {
          addressPrefix: '10.60.0.0/26'
          delegations: [
            {
              name: 'app-service'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
          serviceEndpoints: [
            {
              service: 'Microsoft.Sql'
              locations: [location]
            }
          ]
        }
      }
    ]
  }
}

output integrationSubnetId string = '${network.id}/subnets/app-integration'
