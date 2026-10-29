using System.Text.Json;
using HockeyTrainer.Application.Authentication;
using Microsoft.AspNetCore.DataProtection;

namespace HockeyTrainer.Api.Authentication;

public sealed class SessionTokenProtector(IDataProtectionProvider provider) : ISessionTokenProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("Icework.ServerSessions.Tokens.v1");

    public string Protect(SessionTokens tokens) => _protector.Protect(JsonSerializer.Serialize(tokens));

    public SessionTokens Unprotect(string value) => JsonSerializer.Deserialize<SessionTokens>(_protector.Unprotect(value))
        ?? throw new System.Security.Cryptography.CryptographicException("Invalid session.");
}
