using HockeyTrainer.Api.Authentication;
using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class SessionController(IWebHostEnvironment environment) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("session")]
    public IActionResult GetSession([FromServices] IAntiforgery antiforgery)
    {
        Response.Headers.CacheControl = "no-store";

        return Ok(new
        {
            authenticated = User.Identity?.IsAuthenticated == true,
            email = User.FindFirst("email")?.Value,
            csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken
        });
    }

    [AllowAnonymous]
    [EnableRateLimiting("sign-in")]
    [HttpPost("email")]
    public async Task<IActionResult> SendEmail(SendSignInEmailRequest request,
        [FromServices] ISessionIdentityProvider sessionIdentityProvider, CancellationToken ct)
    {
        await sessionIdentityProvider.SendEmailAsync(request.Email.Trim(), ct);

        return NoContent();
    }

    [AllowAnonymous]
    [EnableRateLimiting("sign-in")]
    [HttpPost("verify")]
    public async Task<IActionResult> Verify(VerifySignInRequest request,
        [FromServices] ISessionIdentityProvider sessionIdentityProvider,
        [FromServices] BrowserSessionService browserSessionService,
        [FromServices] IOptions<BrowserSessionOptions> options, CancellationToken ct)
    {
        var tokens = await sessionIdentityProvider.VerifyAsync(request.Email.Trim(), request.Code, ct);
        var id = await browserSessionService.CreateAsync(tokens, ct);
        // Replace any prior browser session. A new ID is generated after every successful sign-in.
        var name = BrowserSessionHandler.CookieName(environment.IsDevelopment());
        var previous = Request.Cookies[name];
        if (previous is not null)
        {
            await browserSessionService.SignOutAsync(previous, ct);
        }
        var cookie = SessionCookies.Options(environment);
        cookie.MaxAge = TimeSpan.FromDays(options.Value.MaximumDays);
        Response.Cookies.Append(name, id, cookie);

        return NoContent();
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromServices] BrowserSessionService browserSessionService, CancellationToken ct)
    {
        var name = BrowserSessionHandler.CookieName(environment.IsDevelopment());
        await browserSessionService.SignOutAsync(Request.Cookies[name], ct);
        Response.Cookies.Delete(name, SessionCookies.Options(environment));

        return NoContent();
    }
}
