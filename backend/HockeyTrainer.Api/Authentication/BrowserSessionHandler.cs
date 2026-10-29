using System.Security.Claims;
using System.Text.Encodings.Web;
using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace HockeyTrainer.Api.Authentication;

public sealed class BrowserSessionHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder,
    BrowserSessionService browserSessionService,
    IWebHostEnvironment environment) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "BrowserSession";
    public static string CookieName(bool development) => development ? "icework.session" : "__Host-icework.session";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var cookieName = CookieName(environment.IsDevelopment());
        if (!Request.Cookies.TryGetValue(cookieName, out var id))
        {
            return AuthenticateResult.NoResult();
        }
        var skipRefresh = Request.Path == "/api/auth/logout" || Request.Path == "/api/auth/verify";
        var session = await browserSessionService.AuthenticateAsync(id, Context.RequestAborted, !skipRefresh);
        if (session is null)
        {
            Response.Cookies.Delete(cookieName, SessionCookies.Options(environment));

            return AuthenticateResult.Fail("Session expired.");
        }
        var identity = new ClaimsIdentity(
        [
            new Claim("sub", session.UserId.ToString()),
            new Claim("email", session.Email),
            new Claim("role", "authenticated")
        ], SchemeName, "email", "role");

        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }
}

public static class SessionCookies
{
    public static CookieOptions Options(IHostEnvironment environment) => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Lax,
        Path = "/",
        IsEssential = true
    };
}
