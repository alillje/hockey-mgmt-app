using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/trainings")]
public sealed class TrainingsController : ControllerBase
{
    private readonly IHockeyService _service;

    public TrainingsController(IHockeyService service)
    {
        _service = service;
    }

    [HttpGet]
    public Task<List<TrainingResponse>> GetAll(CancellationToken cancellationToken) => _service.GetTrainingsAsync(cancellationToken);

    [HttpGet("{id:guid}")]
    public Task<TrainingResponse> Get(Guid id, CancellationToken cancellationToken) => _service.GetTrainingAsync(id, cancellationToken);

    [HttpPost]
    public async Task<ActionResult<TrainingResponse>> Create(TrainingRequest request, CancellationToken cancellationToken)
    {
        var training = await _service.SaveTrainingAsync(null, request, cancellationToken);
        return CreatedAtAction(nameof(Get), new { id = training.Id }, training);
    }

    [HttpPut("{id:guid}")]
    public Task<TrainingResponse> Update(Guid id, TrainingRequest request, CancellationToken cancellationToken) => _service.SaveTrainingAsync(id, request, cancellationToken);

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await _service.DeleteTrainingAsync(id, cancellationToken);
        return NoContent();
    }
}
