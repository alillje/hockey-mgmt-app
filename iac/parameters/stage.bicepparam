using '../main.bicep'

// Staging is the only environment with an apply and app deployment workflow.
param environment = 'stage'
param location = 'swedencentral'

// Identifiers come from GitHub variables; none of these values is a secret.
param webAppName = readEnvironmentVariable('AZURE_WEBAPP_NAME')
param keyVaultName = 'kv-hockey-stage'
param databaseConnectionString = readEnvironmentVariable('SUPABASE_DATABASE_CONNECTION_STRING')
param databaseSecretName = 'supabase-db-connection'
param supabaseUrl = readEnvironmentVariable('SUPABASE_URL')
param supabasePublishableKey = readEnvironmentVariable('SUPABASE_PUBLISHABLE_KEY')
// Leave empty for a fresh club; set explicitly to adopt existing pre-team content.
param legacyWorkspaceAdminUserId = readEnvironmentVariable('LEGACY_WORKSPACE_ADMIN_USER_ID', '')
// Approved B1 hosting baseline.
param planSku = 'B1'
// The working staging app is intentionally reachable; deployments remain manual.
param enablePublicAccess = true
