using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace HockeyTrainer.Api.Authentication;

public sealed class SupabaseTokenValidator(IOptionsMonitor<JwtBearerOptions> options)
{
    public async Task<SessionTokens> ValidateAsync(string accessToken, string refreshToken, CancellationToken ct)
    {
        var settings = options.Get("SupabaseTokens");
        var discovery = await settings.ConfigurationManager!.GetConfigurationAsync(ct);
        var parameters = settings.TokenValidationParameters.Clone();
        parameters.IssuerSigningKeys = discovery.SigningKeys;
        parameters.ConfigurationManager = settings.ConfigurationManager as BaseConfigurationManager;
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(accessToken, parameters);
        var claims = result.ClaimsIdentity;
        if (!result.IsValid || claims?.FindFirst("role")?.Value != "authenticated" ||
            claims.FindFirst("is_anonymous")?.Value == "true" ||
            !Guid.TryParse(claims.FindFirst("sub")?.Value, out var userId) ||
            string.IsNullOrWhiteSpace(refreshToken))
        {
            throw new ApiException(401, "Invalid sign-in", "The sign-in could not be verified.");
        }

        return new SessionTokens(accessToken, refreshToken,
            new DateTimeOffset(result.SecurityToken.ValidTo, TimeSpan.Zero).ToUnixTimeSeconds(),
            userId, claims.FindFirst("email")?.Value ?? string.Empty);
    }
}
