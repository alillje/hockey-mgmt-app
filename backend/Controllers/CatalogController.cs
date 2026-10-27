using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/catalog")]
public sealed class CatalogController(CatalogService catalogService) : ControllerBase
{
    [HttpGet]
    public Task<CatalogResponse> Get(CancellationToken cancellationToken) => catalogService.GetAsync(cancellationToken);
}
