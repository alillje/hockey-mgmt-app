using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/workspace")]
public sealed class WorkspaceController(WorkspaceService service) : ControllerBase
{
    [HttpGet]
    public Task<WorkspaceResponse> Get(CancellationToken cancellationToken) => service.GetAsync(cancellationToken);

    [HttpPost("organisations")]
    public Task<OrganisationResponse> CreateOrganisation(OrganisationRequest request, CancellationToken cancellationToken) =>
        service.CreateAsync(request, cancellationToken);

    [HttpPost("teams")]
    public Task<TeamResponse> CreateTeam(TeamRequest request, CancellationToken cancellationToken) => service.CreateTeamAsync(request, cancellationToken);

    [HttpGet("members")]
    public Task<List<MemberResponse>> Members(CancellationToken cancellationToken) => service.MembersAsync(cancellationToken);

    [HttpPost("members")]
    public async Task<IActionResult> AddMember(MemberRequest request, CancellationToken cancellationToken)
    {
        await service.AddMemberAsync(request, cancellationToken);
        return NoContent();
    }
}
