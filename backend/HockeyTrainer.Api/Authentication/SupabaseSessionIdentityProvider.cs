using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Services;

namespace HockeyTrainer.Api.Authentication;

public sealed class SupabaseSessionIdentityProvider(
    HttpClient client,
    AuthConfiguration auth,
    SupabaseTokenValidator supabaseTokenValidator) : ISessionIdentityProvider
{
    public async Task SendEmailAsync(string email, CancellationToken ct)
    {
        using var response = await SendAsync("otp", new
        {
            email,
            create_user = false
        }, ct);
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            throw new ApiException(429, "Too many requests", "Please wait before requesting another email.");
        }
        if ((int)response.StatusCode >= 500)
        {
            throw new ApiException(503, "Sign-in unavailable", "Please try again shortly.");
        }
        // Do not reveal whether the email has an account.
    }

    public Task<SessionTokens> VerifyAsync(string email, string code, CancellationToken ct) =>
        ExchangeAsync("verify", new
        {
            email,
            token = code,
            type = "email"
        }, ct);

    public Task<SessionTokens> RefreshAsync(string refreshToken, CancellationToken ct) =>
        ExchangeAsync("token?grant_type=refresh_token", new { refresh_token = refreshToken }, ct);

    public async Task SignOutAsync(string accessToken, CancellationToken ct)
    {
        using var request = CreateRequest("logout?scope=local", new { });
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        try
        {
            using var response = await client.SendAsync(request, ct);
        }
        catch (HttpRequestException)
        {
            throw new ApiException(503, "Sign-out provider unavailable");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(503, "Sign-out provider unavailable");
        }
    }

    private async Task<SessionTokens> ExchangeAsync(string path, object body, CancellationToken ct)
    {
        using var response = await SendAsync(path, body, ct);
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            throw new ApiException(429, "Too many attempts", "Please wait before trying again.");
        }
        if ((int)response.StatusCode >= 500)
        {
            throw new ApiException(503, "Sign-in unavailable", "Please try again shortly.");
        }
        if (!response.IsSuccessStatusCode)
        {
            throw new ApiException(401, "Sign-in expired", "This code or link is invalid or has expired.");
        }
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));

        return await supabaseTokenValidator.ValidateAsync(
            json.RootElement.GetProperty("access_token").GetString()!,
            json.RootElement.GetProperty("refresh_token").GetString()!, ct);
    }

    private async Task<HttpResponseMessage> SendAsync(string path, object body, CancellationToken ct)
    {
        using var request = CreateRequest(path, body);
        try
        {
            return await client.SendAsync(request, ct);
        }
        catch (HttpRequestException)
        {
            throw new ApiException(503, "Sign-in unavailable", "Please try again shortly.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(503, "Sign-in unavailable", "Please try again shortly.");
        }
    }

    private HttpRequestMessage CreateRequest(string path, object body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, auth.Issuer + "/" + path);
        request.Headers.Add("apikey", auth.PublishableKey);
        request.Content = JsonContent.Create(body);

        return request;
    }
}
