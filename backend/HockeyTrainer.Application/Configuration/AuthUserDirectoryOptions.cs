namespace HockeyTrainer.Application.Configuration;

public sealed class AuthUserDirectoryOptions
{
    // Optional for local SQLite workspaces. Hosted PostgreSQL uses the existing application connection.
    public string ConnectionString { get; set; } = string.Empty;
}
