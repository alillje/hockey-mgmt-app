using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/catalog")]
public sealed class CatalogController : ControllerBase
{
    [HttpGet]
    public CatalogResponse Get() => new(Catalog.Categories);
}
