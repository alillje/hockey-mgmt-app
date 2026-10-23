using HockeyTrainer.Api.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AuthConfiguration configuration) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("config")]
    public IActionResult GetConfig() => Ok(new
    {
        enabled = configuration.Enabled,
        supabaseUrl = configuration.SupabaseUrl,
        publishableKey = configuration.PublishableKey
    });
}
