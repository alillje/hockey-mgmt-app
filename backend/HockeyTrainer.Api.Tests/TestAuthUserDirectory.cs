using HockeyTrainer.Application.Authentication;

namespace HockeyTrainer.Api.Tests;

internal sealed class TestAuthUserDirectory : IAuthUserDirectory
{
    public Dictionary<string, Guid> Users { get; } = new(StringComparer.OrdinalIgnoreCase);
    public int LookupCount { get; private set; }

    public Task<Guid?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken)
    {
        LookupCount++;

        return Task.FromResult(Users.TryGetValue(normalizedEmail, out var id) ? (Guid?)id : null);
    }
}
