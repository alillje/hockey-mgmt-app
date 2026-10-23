using System.Text.RegularExpressions;

namespace HockeyTrainer.Api.Authentication;

public sealed class AuthConfiguration
{
    public bool Enabled { get; }
    public string? SupabaseUrl { get; }
    public string? PublishableKey { get; }
    public string? Issuer => SupabaseUrl is null ? null : $"{SupabaseUrl}/auth/v1";

    private AuthConfiguration(bool enabled, string? supabaseUrl, string? publishableKey)
    {
        Enabled = enabled;
        SupabaseUrl = supabaseUrl;
        PublishableKey = publishableKey;
    }

    public static AuthConfiguration Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var mode = configuration["Auth:Mode"] ?? "Disabled";
        if (mode.Equals("Disabled", StringComparison.OrdinalIgnoreCase))
        {
            if (!environment.IsDevelopment())
                throw new InvalidOperationException("Authentication may be disabled only in Development.");

            return new AuthConfiguration(false, null, null);
        }

        if (!mode.Equals("Supabase", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Auth:Mode must be Disabled or Supabase.");

        var url = configuration["Auth:SupabaseUrl"]?.TrimEnd('/');
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != Uri.UriSchemeHttps ||
            !Regex.IsMatch(parsed.Host, @"^[a-z0-9-]+\.supabase\.co$", RegexOptions.IgnoreCase) ||
            (parsed.AbsolutePath != "/" && parsed.AbsolutePath != string.Empty) ||
            !string.IsNullOrEmpty(parsed.Query) || !string.IsNullOrEmpty(parsed.Fragment))
            throw new InvalidOperationException("Auth:SupabaseUrl must be the HTTPS Supabase project URL.");

        var key = configuration["Auth:SupabasePublishableKey"];
        if (string.IsNullOrWhiteSpace(key) || !key.StartsWith("sb_publishable_", StringComparison.Ordinal))
            throw new InvalidOperationException("Auth:SupabasePublishableKey must be a publishable API key.");

        return new AuthConfiguration(true, url, key);
    }
}
