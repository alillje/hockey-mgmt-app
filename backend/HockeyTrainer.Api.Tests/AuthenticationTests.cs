using Microsoft.EntityFrameworkCore;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using HockeyTrainer.Api.Data;
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
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/drills")).StatusCode);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", application.Token(Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/drills")).StatusCode);

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
        private readonly string _databasePath = Path.Combine(Path.GetTempPath(), $"hockey-auth-{Guid.NewGuid():N}.db");
        private readonly ECDsaSecurityKey _key;
        private readonly Guid? _legacyAdmin;

        public AuthenticatedApplication(Guid? legacyAdmin = null)
        {
            _legacyAdmin = legacyAdmin;
            if (legacyAdmin is not null)
            {
                using var legacy = new HockeyTrainer.Api.Data.HockeyDbContext(new Microsoft.EntityFrameworkCore.DbContextOptionsBuilder<HockeyTrainer.Api.Data.HockeyDbContext>()
                    .UseSqlite($"Data Source={_databasePath}").Options);
                legacy.Database.EnsureCreated();
            }
            _key = new ECDsaSecurityKey(_ecdsa) { KeyId = "hockey-test-key" };
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
                    new Claim("is_anonymous", isAnonymous ? "true" : "false")
                ]),
                SigningCredentials = new SigningCredentials(_key, SecurityAlgorithms.EcdsaSha256)
            };
            return new JsonWebTokenHandler().CreateToken(descriptor);
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Staging");
            if (_legacyAdmin is not null) builder.UseSetting("Workspace:LegacyAdminUserId", _legacyAdmin.ToString());
            builder.UseSetting("DatabasePath", _databasePath);
            builder.UseSetting("Database:Provider", "Sqlite");
            builder.UseSetting("Auth:Mode", "Supabase");
            builder.UseSetting("Auth:SupabaseUrl", "https://hockey-auth-test.supabase.co");
            builder.UseSetting("Auth:SupabasePublishableKey", "sb_publishable_test-only");
            builder.ConfigureTestServices(services => services.PostConfigure<JwtBearerOptions>(
                JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    var discovery = new OpenIdConnectConfiguration { Issuer = Issuer };
                    discovery.SigningKeys.Add(_key);
                    options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(discovery);
                }));
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            if (disposing)
            {
                _ecdsa.Dispose();
                Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
                if (File.Exists(_databasePath)) File.Delete(_databasePath);
            }
        }
    }
}
