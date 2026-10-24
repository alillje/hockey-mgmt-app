using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/catalog")]
public sealed class CatalogController(CatalogService service) : ControllerBase
{
    [HttpGet]
    public Task<CatalogResponse> Get(CancellationToken cancellationToken) => service.GetAsync(cancellationToken);
}
