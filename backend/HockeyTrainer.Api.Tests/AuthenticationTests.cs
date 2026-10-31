using Microsoft.EntityFrameworkCore;
using HockeyTrainer.Api.Authentication;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Application.Authentication;
using System.Net.Http.Json;
using System.Text.Json;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class AuthenticationTests
{
    private static readonly Guid UserId = Guid.NewGuid();
    private const string Issuer = "https://hockey-auth-test.supabase.co/auth/v1";

    [Fact]
    public async Task SupabaseModeProtectsContentButKeepsHealthAndPublicConfigurationAvailable()
    {
        using var application = new AuthenticatedApplication();
        using var client = application.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/health")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/readiness")).StatusCode);
        var config = await client.GetStringAsync("/api/auth/config");
        Assert.Contains("hockey-auth-test.supabase.co", config);
        Assert.DoesNotContain("Password", config);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/drills")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/catalog")).StatusCode);
    }

    [Fact]
    public async Task VerifiedUsersNeedMembershipAndInvalidTokensCannotAuthenticate()
    {
        using var application = new AuthenticatedApplication();
        using var client = application.CreateClient();

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", application.Token(UserId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/drills")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", application.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/drills")).StatusCode);

        foreach (var token in new[]
        {
            "invalid-token",
            application.Token(UserId, role: "anon"),
            application.Token(UserId, isAnonymous: true),
            application.Token(UserId, issuer: "https://other.supabase.co/auth/v1")
        })
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/drills")).StatusCode);
        }
    }

    internal sealed class AuthenticatedApplication : WebApplicationFactory<Program>
    {
        private readonly ECDsa _ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        private readonly string _databasePath;
        private readonly bool _deleteDatabase;
        private readonly ECDsaSecurityKey _key;
        public string? NextVerificationToken { get; set; }
        public TestAuthUserDirectory AuthUsers { get; } = new();
        public int RefreshCount { get; set; }
        public bool RejectRefresh { get; set; }
        public bool FailLogout { get; set; }
        public string? EmailRequestBody { get; set; }
        public Guid PlatformAdminId { get; } = Guid.NewGuid();

        public AuthenticatedApplication(Guid? legacyAdmin = null, string? databasePath = null)
        {
            _databasePath = databasePath ?? Path.Combine(Path.GetTempPath(), $"hockey-auth-{Guid.NewGuid():N}.db");
            _deleteDatabase = databasePath is null;
            if (legacyAdmin is Guid administratorId)
            {
                PlatformAdminId = administratorId;
            }

            if (legacyAdmin is not null)
            {
                using var legacy = new HockeyTrainer.Infrastructure.Data.HockeyDbContext(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<HockeyTrainer.Infrastructure.Data.HockeyDbContext>()
                    .UseSqlite($"Data Source={_databasePath}").Options);
                legacy.Database.EnsureCreated();
            }
            _key = new ECDsaSecurityKey(_ecdsa) { KeyId = "hockey-test-key" };
        }

        public new HttpClient CreateClient() => base.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("https://localhost")
        });

        public void AuthenticateClient(HttpClient client, Guid userId, bool completeProfile = true)
        {
            using var scope = Services.CreateScope();
            if (completeProfile)
            {
                scope.ServiceProvider.GetRequiredService<HockeyTrainer.Application.Repositories.IUserProfileRepository>()
                    .SaveAsync(new HockeyTrainer.Domain.Models.UserProfile
                    {
                        UserId = userId,
                        FirstName = "Test",
                        LastName = "Coach",
                        Email = "coach@example.com"
                    }, default).GetAwaiter().GetResult();
            }
            var sessionService = scope.ServiceProvider.GetRequiredService<BrowserSessionService>();
            var id = sessionService.CreateAsync(new SessionTokens(Token(userId), "test-refresh", DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds(), userId, "coach@example.com"), default).GetAwaiter().GetResult();
            client.DefaultRequestHeaders.Remove("Cookie");
            client.DefaultRequestHeaders.Add("Cookie", "__Host-icework.session=" + id);
            using var response = client.GetAsync("/api/auth/session").GetAwaiter().GetResult();
            var json = JsonDocument.Parse(response.Content.ReadAsStringAsync().GetAwaiter().GetResult());
            client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
            client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", json.RootElement.GetProperty("csrfToken").GetString());
        }

        public string Token(Guid userId, string role = "authenticated", string issuer = Issuer, bool isAnonymous = false)
        {
            var descriptor = new SecurityTokenDescriptor
            {
                Issuer = issuer,
                Audience = "authenticated",
                Expires = DateTime.UtcNow.AddMinutes(5),
                Subject = new ClaimsIdentity(
                [
                    new Claim("sub", userId.ToString()),
                    new Claim("role", role),
                    new Claim("email", "coach@example.com"),
                    new Claim("is_anonymous", isAnonymous ? "true" : "false")
                ]),
                SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.EcdsaSha256)
            };

            return new JsonWebTokenHandler().CreateToken(descriptor);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            builder.UseSetting("Workspace:LegacyAdminUserId", PlatformAdminId.ToString());
            builder.UseSetting("DatabasePath", _databasePath);
            builder.UseSetting("Database:Provider", "Sqlite");
            builder.UseSetting("Auth:Session:KeyRingPath", _databasePath + ".keys");
            builder.UseSetting("Auth:Mode", "Supabase");
            builder.UseSetting("Auth:SupabaseUrl", "https://hockey-auth-test.supabase.co");
            builder.UseSetting("Auth:SupabasePublishableKey", "sb_publishable_test-only");
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<IAuthUserDirectory>(AuthUsers);
                services.AddHttpClient<ISessionIdentityProvider, SupabaseSessionIdentityProvider>()
                    .ConfigurePrimaryHttpMessageHandler(() => new ProviderHandler(this));
                services.PostConfigure<JwtBearerOptions>(
                "SupabaseTokens", options =>
                {
                    var discovery = new OpenIdConnectConfiguration
                    {
                        Issuer = Issuer
                    };
                    discovery.SigningKeys.Add(_key);
                    options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(discovery);
                });
            });
        }

        private sealed class ProviderHandler(AuthenticatedApplication application) : HttpMessageHandler
        {
            protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            {
                if (request.RequestUri!.AbsolutePath.EndsWith("/otp"))
                {
                    application.EmailRequestBody = await request.Content!.ReadAsStringAsync(ct);

                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { }) };
                }
                if (request.RequestUri.AbsolutePath.EndsWith("/logout"))
                {
                    if (application.FailLogout)
                    {
                        throw new HttpRequestException("Provider unavailable");
                    }

                    return new HttpResponseMessage(HttpStatusCode.NoContent);
                }
                if (request.RequestUri.AbsolutePath.EndsWith("/token"))
                {
                    application.RefreshCount++;
                    if (application.RejectRefresh)
                    {
                        return new HttpResponseMessage(HttpStatusCode.BadRequest);
                    }
                }

                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = JsonContent.Create(new
                    {
                        access_token = application.NextVerificationToken ?? application.Token(application.PlatformAdminId),
                        refresh_token = "rotated-test-refresh"
                    })
                };
            }
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing)
            {
                _ecdsa.Dispose();
                Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
                if (_deleteDatabase && File.Exists(_databasePath))
                {
                    File.Delete(_databasePath);
                }
            }
        }
    }
}
