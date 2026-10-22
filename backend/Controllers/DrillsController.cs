using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/drills")]
public sealed class DrillsController : ControllerBase
{
    private readonly IHockeyService _service;

    public DrillsController(IHockeyService service)
    {
        _service = service;
    }

    [HttpGet]
    public Task<List<DrillResponse>> GetAll([FromQuery] string? search, [FromQuery] string? categoryId, CancellationToken cancellationToken) => _service.GetDrillsAsync(search, categoryId, cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<DrillResponse> Get(Guid id, CancellationToken cancellationToken) => _service.GetDrillAsync(id, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<DrillResponse>> Create(DrillRequest request, CancellationToken cancellationToken)
    {
        var drill = await _service.SaveDrillAsync(null, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = drill.Id }, drill);
    }

    [HttpPut("{id:guid}")]
    public Task<DrillResponse> Update(Guid id, DrillRequest request, CancellationToken cancellationToken) => _service.SaveDrillAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteDrillAsync(id, cancellationToken);
        return NoContent();
    }
}
