using HockeyTrainer.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/readiness")]
public sealed class ReadinessController(DatabaseReadiness databaseReadiness) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        if (await databaseReadiness.IsReadyAsync(cancellationToken))
        {
            return Ok(new
            {
                status = "ready"
            });
        }

        return Unavailable();
    }

    private ObjectResult Unavailable() => Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
        title: "Database unavailable", detail: "Database connectivity, schema, or permissions are not ready.");
}
