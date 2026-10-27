using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/drills")]
public sealed class DrillsController(IHockeyService hockeyService) : ControllerBase
{
    [HttpGet]
    public Task<List<DrillResponse>> GetAll([FromQuery] string? search, [FromQuery] string? categoryId, [FromQuery] string? tag, CancellationToken cancellationToken) =>
        hockeyService.GetDrillsAsync(search, categoryId, cancellationToken, tag);

    [HttpGet("{id:guid}")]
    public Task<DrillResponse> Get(Guid id, CancellationToken cancellationToken) => hockeyService.GetDrillAsync(id, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<DrillResponse>> Create(DrillRequest request, CancellationToken cancellationToken)
    {
        var drill = await hockeyService.SaveDrillAsync(null, request, cancellationToken);

        return CreatedAtAction(nameof(Get), new
        {
            id = drill.Id
        }, drill);
    }

    [HttpPut("{id:guid}")]
    public Task<DrillResponse> Update(Guid id, DrillRequest request, CancellationToken cancellationToken) => hockeyService.SaveDrillAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await hockeyService.DeleteDrillAsync(id, cancellationToken);

        return NoContent();
    }

    [HttpPost("{id:guid}/copy-to-team")]
    public Task<DrillResponse> CopyToTeam(Guid id, CancellationToken cancellationToken) =>
        hockeyService.CopyDrillAsync(id, false, cancellationToken);

    [HttpPost("{id:guid}/copy")]
    public Task<DrillResponse> Copy(Guid id, CopyDestinationRequest destination, CancellationToken cancellationToken) =>
        hockeyService.CopyDrillAsync(id, destination, cancellationToken);

    [HttpPost("{id:guid}/copy-to-library")]
    public Task<DrillResponse> CopyToLibrary(Guid id, CancellationToken cancellationToken) =>
        hockeyService.CopyDrillAsync(id, true, cancellationToken);
}
