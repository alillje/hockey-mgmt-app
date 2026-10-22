using System.Text.Json;
using System.Text.RegularExpressions;

namespace HockeyTrainer.Database;

public sealed record DatabaseTarget(string Environment, string ResourceGroup, string ServerName,
    string ServerHost, string DatabaseName, string RuntimeIdentityName,
    Guid RuntimeIdentityObjectId, Guid DeploymentIdentityObjectId)
{
    public static DatabaseTarget Load(string path)
    {
        var target = JsonSerializer.Deserialize<DatabaseTarget>(File.ReadAllText(path),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("A database target is required.");
        target.Validate();
        return target;
    }

    public void Validate()
    {
        if (Environment != "stage" || DatabaseName != "hockey-stage" ||
            !Regex.IsMatch(ServerName ?? "", @"^sql-hockey-stage-[a-z0-9]+$", RegexOptions.CultureInvariant) ||
            ServerHost != $"{ServerName}.database.windows.net" ||
            !Regex.IsMatch(RuntimeIdentityName ?? "", @"^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$", RegexOptions.CultureInvariant) ||
            string.IsNullOrWhiteSpace(ResourceGroup) || RuntimeIdentityName == "hockey-stage-deployer" || RuntimeIdentityObjectId == Guid.Empty ||
            DeploymentIdentityObjectId == Guid.Empty || RuntimeIdentityObjectId == DeploymentIdentityObjectId)
            throw new InvalidOperationException("A valid stage-only database target with separate deployment/runtime identities is required.");
    }
}
