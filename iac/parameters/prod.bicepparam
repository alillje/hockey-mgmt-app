using '../main.bicep'

// Temporary production-project evaluation; manual apply is required to open the site.
// A real production launch needs its own authorization and recovery review.
param environment = 'prod'
param location = 'swedencentral'

// The prod GitHub environment provides the same variable names as stage, with separate values.
param webAppName = readEnvironmentVariable('AZURE_WEBAPP_NAME')
param keyVaultName = 'kv-hockey-prod'
param databaseConnectionString = readEnvironmentVariable('SUPABASE_DATABASE_CONNECTION_STRING')
param databaseSecretName = 'supabase-db-connection'
param supabaseUrl = readEnvironmentVariable('SUPABASE_URL')
param supabasePublishableKey = readEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY')
// Leave empty for a fresh club; set explicitly to adopt existing pre-team content.
param legacyWorkspaceAdminUserId = readEnvironmentVariable('LEGACY_WORKSPACE_ADMIN_USER_ID', '')
param customDomainHostName = 'iceworkhockey.com'
// Proposed production hosting baseline, subject to an approved regional quote.
param planSku = 'B1'
param enablePublicAccess = true
