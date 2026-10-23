using System.Net;
using HockeyTrainer.Api.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class HostingTests
{
    [Fact]
    public async Task PublishedFrontendSupportsDeepLinksAndPreservesApiAndMissingAssetErrors()
    {
        using var application = new HostedApplication();
        using var client = application.CreateClient();
        foreach (var path in new[] { "/", "/drills/new", "/practices/all?search=skating" })
        {
            var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
            Assert.Contains("Hockey test entry", await response.Content.ReadAsStringAsync());
        }

        Assert.Equal("window.hockey = true;", await client.GetStringAsync("/assets/app.js"));
        foreach (var path in new[] { "/api/unknown", "/api", "/assets/missing.js", $"/api/drills/{Guid.NewGuid()}" })
        {
            var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.DoesNotContain("Hockey test entry", await response.Content.ReadAsStringAsync());
        }

        var post = await client.PostAsync("/drills/new", null);
        Assert.False(post.IsSuccessStatusCode);
        Assert.DoesNotContain("Hockey test entry", await post.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/readiness")).StatusCode);
    }

    [Fact]
    public void PostgreSqlUsesExplicitConfigurationWithoutCreatingLocalData()
    {
        using var application = new HostedApplication("PostgreSql", "Host=localhost;Database=offline;Username=postgres");
        using var scope = application.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        Assert.True(database.Database.IsNpgsql());
        Assert.False(File.Exists(application.DatabasePath));
        // Accessing Services starts the app. No PostgreSQL connection or startup DDL is needed.
    }

    [Fact]
    public void PostgreSqlCertificateResolvesFromApplicationContentRootWithoutOpeningAConnection()
    {
        using var application = new HostedApplication("PostgreSql",
            "Host=localhost;Database=offline;Username=postgres;SSL Mode=VerifyFull;Root Certificate=Certificates/supabase-stage-root.crt");
        using var scope = application.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        var connection = new NpgsqlConnectionStringBuilder(database.Database.GetConnectionString());
        Assert.Equal(Path.Combine(environment.ContentRootPath, "Certificates", "supabase-stage-root.crt"), connection.RootCertificate);
        Assert.Equal(SslMode.VerifyFull, connection.SslMode);
        Assert.False(File.Exists(application.DatabasePath));
    }

    [Fact]
    public void PostgreSqlVerifyFullUsesPackagedCertificateWithoutChangingTheConnectionSecret()
    {
        var contentRoot = Path.Combine(Path.GetTempPath(), "hockey-ca-test", Guid.NewGuid().ToString("N"));
        var certificateDirectory = Path.Combine(contentRoot, "Certificates");
        Directory.CreateDirectory(certificateDirectory);
        try
        {
            var certificatePath = Path.Combine(certificateDirectory, "supabase-stage-root.crt");
            File.WriteAllText(certificatePath, "test certificate");
            var resolved = DatabaseConfiguration.ResolvePostgreSqlCertificate(
                "Host=localhost;Database=offline;Username=postgres;SSL Mode=VerifyFull", contentRoot, "Staging");
            Assert.Equal(certificatePath, new NpgsqlConnectionStringBuilder(resolved).RootCertificate);
            Assert.Throws<FileNotFoundException>(() => DatabaseConfiguration.ResolvePostgreSqlCertificate(
                "Host=localhost;Database=offline;Username=postgres;SSL Mode=VerifyFull", contentRoot, "Production"));
        }
        finally
        {
            Directory.Delete(contentRoot, recursive: true);
        }
    }

    [Theory]
    [InlineData("PostgreSql")]
    [InlineData("SqlServer")]
    [InlineData("unsupported")]
    public void InvalidDatabaseConfigurationFailsAtStartup(string provider)
    {
        using var application = new HostedApplication(provider);
        Assert.Throws<InvalidOperationException>(() => application.CreateClient());
        Assert.False(File.Exists(application.DatabasePath));
    }

    private sealed class HostedApplication : WebApplicationFactory<Program>
    {
        private readonly string _root = Path.Combine(Path.GetTempPath(), "hockey-hosting-tests", Guid.NewGuid().ToString("N"));
        private readonly string _provider;
        private readonly string? _connectionString;
        public string DatabasePath => Path.Combine(_root, "data", "test.db");

        public HostedApplication(string provider = "Sqlite", string? connectionString = null)
        {
            _provider = provider;
            _connectionString = connectionString;
            Directory.CreateDirectory(Path.Combine(_root, "wwwroot", "assets"));
            File.WriteAllText(Path.Combine(_root, "wwwroot", "index.html"), "<!doctype html><title>Hockey test entry</title>");
            File.WriteAllText(Path.Combine(_root, "wwwroot", "assets", "app.js"), "window.hockey = true;");
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseWebRoot(Path.Combine(_root, "wwwroot"));
            builder.UseSetting("Database:Provider", _provider);
            builder.UseSetting("DatabasePath", DatabasePath);
            if (_connectionString != null) builder.UseSetting("ConnectionStrings:Hockey", _connectionString);
        }

        protected override void Dispose(bool disposing)
        {
            base.Dispose(disposing);
            // SQLite pools can hold handles on Windows; clear only the test connection's pool.
            using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={DatabasePath}");
            Microsoft.Data.Sqlite.SqliteConnection.ClearPool(connection);
            if (disposing && Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
        }
    }
}
