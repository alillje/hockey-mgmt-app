using System.Threading.RateLimiting;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Infrastructure.Repositories;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

namespace HockeyTrainer.Api.Authentication;

public static class SessionAuthenticationRegistration
{
    public static IServiceCollection AddSessionAuthentication(this IServiceCollection services,
        IConfiguration configuration, IHostEnvironment environment, AuthConfiguration auth)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddOptions<BrowserSessionOptions>().Bind(configuration.GetSection("Auth:Session"))
            .Validate(o => o.IdleHours is >= 1 and <= 168 && o.MaximumDays is >= 1 and <= 30,
                "Session idle hours must be 1–168 and maximum days 1–30.")
            .ValidateOnStart();

        var keyPath = configuration["Auth:Session:KeyRingPath"];
        if (string.IsNullOrEmpty(keyPath))
        {
            if (!environment.IsDevelopment())
            {
                throw new InvalidOperationException("Auth:Session:KeyRingPath must point to persistent, app-private storage.");
            }
            keyPath = Path.Combine(environment.ContentRootPath, "App_Data", "session-keys");
        }
        var directory = Directory.CreateDirectory(keyPath);
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(directory.FullName, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        services.AddDataProtection().SetApplicationName("Icework." + environment.EnvironmentName)
            .PersistKeysToFileSystem(directory);
        services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = environment.IsDevelopment() ? "icework.csrf" : "__Host-icework.csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.Path = "/";
        });
        services.AddAuthentication(BrowserSessionHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, BrowserSessionHandler>(BrowserSessionHandler.SchemeName, _ => { })
            // Validates tokens received by the server; bearer headers do not authenticate API requests.
            .AddJwtBearer("SupabaseTokens", options =>
            {
                options.Authority = auth.Issuer;
                options.RequireHttpsMetadata = true;
                options.BackchannelTimeout = TimeSpan.FromSeconds(10);
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = auth.Issuer,
                    ValidateAudience = true,
                    ValidAudience = "authenticated",
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ValidateIssuerSigningKey = true,
                    ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256],
                    ClockSkew = TimeSpan.FromSeconds(30)
                };
            });
        services.AddScoped<IBrowserSessionRepository, BrowserSessionRepository>();
        services.AddScoped<ISessionTokenProtector, SessionTokenProtector>();
        services.AddScoped<BrowserSessionService>();
        services.AddScoped<SupabaseTokenValidator>();
        services.AddHttpClient<ISessionIdentityProvider, SupabaseSessionIdentityProvider>(client =>
            client.Timeout = TimeSpan.FromSeconds(10)).RemoveAllLoggers();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = async (context, ct) =>
            {
                context.HttpContext.Response.Headers.RetryAfter = "60";
                await Results.Problem(statusCode: 429, title: "Too many requests",
                    detail: "Please wait before trying again.").ExecuteAsync(context.HttpContext);
            };
            options.AddPolicy("sign-in", context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 20,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0
                }));
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    context.User.FindFirst("sub")?.Value ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 600,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
        });

        return services;
    }
}
