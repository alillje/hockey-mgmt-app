using HockeyTrainer.Application.Contracts;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace HockeyTrainer.Api.Tests;

public sealed class SessionSecurityTests
{
    [Fact]
    public async Task CleanupCannotReleaseAnotherOwnersReservationOrRecreateDeletedSession()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        app.AuthenticateClient(client, app.PlatformAdminId);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        var repository = scope.ServiceProvider.GetRequiredService<IBrowserSessionRepository>();
        var session = await database.BrowserSessions.AsNoTracking().SingleAsync();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        Assert.True(await repository.AcquireRefreshAsync(session.IdHash, now, now + 30, CancellationToken.None));
        Assert.True(await repository.AcquireRefreshAsync(session.IdHash, now + 31, now + 61, CancellationToken.None));
        await repository.ReleaseRefreshAsync(session.IdHash, now + 30, CancellationToken.None);
        Assert.Equal(now + 61, (await repository.GetAsync(session.IdHash, CancellationToken.None))!.RefreshLeaseUntil);
        await repository.DeleteAsync(session.IdHash, CancellationToken.None);
        await repository.ReleaseRefreshAsync(session.IdHash, now + 61, CancellationToken.None);
        Assert.Null(await repository.GetAsync(session.IdHash, CancellationToken.None));
    }

    [Fact]
    public async Task FailedRefreshReleasesReservationAndNextRequestRecovers()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        app.AuthenticateClient(client, app.PlatformAdminId);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        app.FailRefresh = true;
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(0, (await database.BrowserSessions.AsNoTracking().SingleAsync()).RefreshLeaseUntil);
        app.FailRefresh = false;
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(2, app.RefreshCount);
    }

    [Fact]
    public async Task AbandonedReservationAllowsShellAndConfigurationAndReturnsRetryHintForApi()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        app.AuthenticateClient(client, app.PlatformAdminId);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        var deadline = DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 60;
        await database.BrowserSessions.ExecuteUpdateAsync(s => s
            .SetProperty(row => row.AccessExpiresAt, 0L)
            .SetProperty(row => row.RefreshLeaseUntil, deadline));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/config")).StatusCode);
        Assert.NotEqual(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/about")).StatusCode);
        using var waiting = await client.GetAsync("/api/auth/session");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, waiting.StatusCode);
        Assert.Equal("1", waiting.Headers.GetValues("Retry-After").Single());
        var problem = await waiting.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Session refresh in progress", problem.GetProperty("title").GetString());
        Assert.Equal(deadline, (await database.BrowserSessions.AsNoTracking().SingleAsync()).RefreshLeaseUntil);
        // Simulate expiry of the old process's lease; no manual row deletion is required.
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.RefreshLeaseUntil, 0L));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
    }

    [Fact]
    public async Task DisconnectDuringRefreshStillPersistsRotationForNextRequest()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        app.AuthenticateClient(client, app.PlatformAdminId);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        app.BeforeRefresh = async ct =>
        {
            started.SetResult();
            await finish.Task.WaitAsync(ct);
        };
        using var aborted = new CancellationTokenSource();
        var request = client.GetAsync("/api/workspace", aborted.Token);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        aborted.Cancel();
        finish.SetResult();
        try
        {
            using var response = await request;
        }
        catch (OperationCanceledException)
        {
        }
        // The next request waits for the first request's independent refresh to finish.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(1, app.RefreshCount);
        Assert.Equal(0, (await database.BrowserSessions.AsNoTracking().SingleAsync()).RefreshLeaseUntil);
    }

    [Fact]
    public async Task CsrfIsRequiredForSignInAndWritesAndTokensStayOnServer()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        var body = new { email = "coach@example.com", code = "123456" };
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/verify", body)).StatusCode);
        await SetCsrfAsync(client);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/email", new { email = body.email })).StatusCode);
        Assert.Contains("\"create_user\":false", app.EmailRequestBody);
        using var verified = await client.PostAsJsonAsync("/api/auth/verify", body);
        Assert.Equal(HttpStatusCode.NoContent, verified.StatusCode);
        Assert.Equal(string.Empty, await verified.Content.ReadAsStringAsync());
        var cookie = verified.Headers.GetValues("Set-Cookie").Single(s => s.StartsWith("__Host-icework.session="));
        Assert.Contains("httponly", cookie.ToLowerInvariant());
        Assert.Contains("secure", cookie.ToLowerInvariant());
        Assert.Contains("samesite=lax", cookie.ToLowerInvariant());
        Assert.DoesNotContain("access_token", cookie);
        Assert.DoesNotContain("test-refresh", cookie);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
        // The anonymous CSRF token is not valid after sign-in changes the principal.
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/workspace/organisations", new { name = "Blocked" })).StatusCode);
        await SetCsrfAsync(client);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/account/profile", new UserProfileRequest("Test", "Coach"))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/workspace/organisations", new { name = "Session club" })).StatusCode);
        using var scope = app.Services.CreateScope();
        var row = await scope.ServiceProvider.GetRequiredService<HockeyDbContext>().BrowserSessions.SingleAsync();
        Assert.DoesNotContain("rotated-test-refresh", row.ProtectedTokens);
        Assert.NotEqual(cookie.Split('=')[1].Split(';')[0], row.IdHash);
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", "forged");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        await SetCsrfAsync(client);
        app.FailLogout = true;
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Empty(await scope.ServiceProvider.GetRequiredService<HockeyDbContext>().BrowserSessions.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task JwtValidationRejectsUntrustedProviderResultsAndBearerHeaders()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        await SetCsrfAsync(client);
        foreach (var token in new[]
        {
            "invalid", app.Token(app.PlatformAdminId, role: "anon"),
            app.Token(app.PlatformAdminId, isAnonymous: true),
            app.Token(app.PlatformAdminId, issuer: "https://other.supabase.co/auth/v1")
        })
        {
            app.NextVerificationToken = token;
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/verify",
                new { email = "coach@example.com", code = "123456" })).StatusCode);
        }
        client.DefaultRequestHeaders.Authorization = new("Bearer", app.Token(app.PlatformAdminId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/workspace")).StatusCode);
    }

    [Fact]
    public async Task RefreshRotatesEncryptedTokensAndRevokedAndExpiredSessionsAreDenied()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        app.AuthenticateClient(client, app.PlatformAdminId);
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        var original = await database.BrowserSessions.AsNoTracking().SingleAsync();
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(1, app.RefreshCount);
        var refreshed = await database.BrowserSessions.AsNoTracking().SingleAsync();
        Assert.NotEqual(original.ProtectedTokens, refreshed.ProtectedTokens);
        Assert.Equal(original.AbsoluteExpiresAt, refreshed.AbsoluteExpiresAt);
        // A second request uses the refreshed record rather than rotating again.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Equal(1, app.RefreshCount);
        app.RejectRefresh = true;
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/workspace")).StatusCode);
        Assert.Empty(await database.BrowserSessions.ToListAsync());

        using var expired = app.CreateClient();
        app.AuthenticateClient(expired, app.PlatformAdminId);
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.IdleExpiresAt, 0L));
        Assert.Equal(HttpStatusCode.Unauthorized, (await expired.GetAsync("/api/workspace")).StatusCode);
        using var absolute = app.CreateClient();
        app.AuthenticateClient(absolute, app.PlatformAdminId);
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AbsoluteExpiresAt, 0L));
        Assert.Equal(HttpStatusCode.Unauthorized, (await absolute.GetAsync("/api/workspace")).StatusCode);
    }

    [Fact]
    public async Task RetiredMagicLinkPayloadIsRejectedAndOtherBrowserCannotReuseCsrfToken()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        await SetCsrfAsync(client);
        using var other = app.CreateClient();
        other.DefaultRequestHeaders.Add("X-CSRF-TOKEN", client.DefaultRequestHeaders.GetValues("X-CSRF-TOKEN").Single());
        var body = new { email = "coach@example.com", code = "123456" };
        Assert.Equal(HttpStatusCode.BadRequest, (await other.PostAsJsonAsync("/api/auth/verify", body)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/auth/verify")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/verify", new { tokenHash = new string('a', 64) })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/workspace")).StatusCode);
    }

    [Fact]
    public async Task ConcurrentRequestsRefreshOnceAndLogoutPreventsCookieReplay()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var first = app.CreateClient();
        app.AuthenticateClient(first, app.PlatformAdminId);
        var cookie = first.DefaultRequestHeaders.GetValues("Cookie").Single();
        using var scope = app.Services.CreateScope();
        var database = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
        await database.BrowserSessions.ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
        var clients = Enumerable.Range(0, 5).Select(_ =>
        {
            var client = app.CreateClient();
            client.DefaultRequestHeaders.Add("Cookie", cookie);

            return client;
        }).ToList();
        try
        {
            var responses = await Task.WhenAll(clients.Select(c => c.GetAsync("/api/workspace")));
            Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
            Assert.Equal(1, app.RefreshCount);
            await SetCsrfAsync(first);
            Assert.Equal(HttpStatusCode.NoContent, (await first.PostAsync("/api/auth/logout", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await clients[0].GetAsync("/api/workspace")).StatusCode);
        }
        finally
        {
            foreach (var client in clients)
            {
                client.Dispose();
            }
        }
    }

    [Fact]
    public async Task SessionAndProtectionKeysSurviveApplicationRestart()
    {
        var directory = Directory.CreateTempSubdirectory("hockey-session-restart-");
        var path = Path.Combine(directory.FullName, "sessions.db");
        try
        {
            string cookie;
            Guid userId;
            using (var app = new AuthenticationTests.AuthenticatedApplication(databasePath: path))
            using (var client = app.CreateClient())
            {
                app.AuthenticateClient(client, app.PlatformAdminId);
                cookie = client.DefaultRequestHeaders.GetValues("Cookie").Single();
                userId = app.PlatformAdminId;
            }
            using var restarted = new AuthenticationTests.AuthenticatedApplication(userId, databasePath: path);
            using var resumed = restarted.CreateClient();
            resumed.DefaultRequestHeaders.Add("Cookie", cookie);
            Assert.Equal(HttpStatusCode.OK, (await resumed.GetAsync("/api/workspace")).StatusCode);
            using var scope = restarted.Services.CreateScope();
            // Force a refresh after restart, proving that the persisted key ring decrypts the tokens.
            await scope.ServiceProvider.GetRequiredService<HockeyDbContext>().BrowserSessions
                .ExecuteUpdateAsync(s => s.SetProperty(row => row.AccessExpiresAt, 0L));
            Assert.Equal(HttpStatusCode.OK, (await resumed.GetAsync("/api/workspace")).StatusCode);
            Assert.Equal(1, restarted.RefreshCount);
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            directory.Delete(true);
        }
    }

    [Fact]
    public async Task SignInRateLimitIsEnforcedByServer()
    {
        using var app = new AuthenticationTests.AuthenticatedApplication();
        using var client = app.CreateClient();
        await SetCsrfAsync(client);
        for (var attempt = 0; attempt < 20; attempt++)
        {
            Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/email",
                new { email = "coach@example.com" })).StatusCode);
        }
        using var rejected = await client.PostAsJsonAsync("/api/auth/email", new { email = "coach@example.com" });
        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("60", rejected.Headers.GetValues("Retry-After").Single());
    }

    internal static async Task SetCsrfAsync(HttpClient client)
    {
        var json = await client.GetFromJsonAsync<JsonElement>("/api/auth/session");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", json.GetProperty("csrfToken").GetString());
    }
}
