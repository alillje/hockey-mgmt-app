param serverName string
param integrationSubnetId string

resource server 'Microsoft.Sql/servers@2023-08-01' existing = {
  name: serverName
}

// SQL authorizes the subnet rather than App Service's changing outbound IPs.
resource appNetworkRule 'Microsoft.Sql/servers/virtualNetworkRules@2023-08-01' = {
  parent: server
  name: 'app-integration-subnet'
  properties: {
    virtualNetworkSubnetId: integrationSubnetId
    ignoreMissingVnetServiceEndpoint: false
  }
}
