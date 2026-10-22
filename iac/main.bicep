targetScope = 'resourceGroup'

@allowed(['stage', 'prod'])
@description('Only stage is connected to deployment workflows. Production requires a separate launch decision.')
param environment string

@description('Azure region for this environment.')
param location string = resourceGroup().location

@description('Globally unique name of the environment web app.')
param webAppName string

@allowed(['B1'])
@description('B1 is the approved stage hosting baseline.')
param planSku string = 'B1'

@description('Keep public web access disabled until authentication and hosted persistence are ready.')
param enablePublicAccess bool = false

var tags = {
  application: 'hockey-mgmt-app'
  environment: environment
  managedBy: 'bicep'
}

module web 'modules/web.bicep' = {
  name: '${environment}-web-app'
  params: {
    location: location
    webAppName: webAppName
    planName: 'asp-hockey-${environment}'
    planSku: planSku
    enablePublicAccess: enablePublicAccess
    tags: tags
  }
}

module applicationSettings 'modules/application-settings.bicep' = {
  name: '${environment}-application-settings'
  params: {
    webAppName: web.outputs.webAppName
    // Read in the parent deployment; reading inside the settings module creates a self-dependency.
    existingSettings: list(resourceId('Microsoft.Web/sites/config', webAppName, 'appsettings'), '2024-11-01').properties
    defaultHostName: web.outputs.defaultHostName
  }
}

output webAppName string = web.outputs.webAppName
output webAppUrl string = web.outputs.webAppUrl
output runtimeIdentityObjectId string = web.outputs.runtimeIdentityObjectId
output environmentName string = environment
