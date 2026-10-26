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

    [HttpPut("members/{userId:guid}")]
    public async Task<IActionResult> UpdateMemberRole(Guid userId, MemberRoleRequest request, CancellationToken cancellationToken)
    {
        await service.UpdateMemberRoleAsync(userId, request, cancellationToken);
        return NoContent();
    }

    [HttpDelete("members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid userId, CancellationToken cancellationToken)
    {
        await service.RemoveMemberAsync(userId, cancellationToken);
        return NoContent();
    }

    [HttpPut("teams/{teamId:guid}/members/{userId:guid}")]
    public async Task<IActionResult> UpdateTeamMemberRole(Guid teamId, Guid userId, TeamMemberRoleRequest request, CancellationToken cancellationToken)
    {
        await service.UpdateTeamMemberRoleAsync(teamId, userId, request, cancellationToken);
        return NoContent();
    }

    [HttpDelete("teams/{teamId:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveTeamMember(Guid teamId, Guid userId, CancellationToken cancellationToken)
    {
        await service.RemoveTeamMemberAsync(teamId, userId, cancellationToken);
        return NoContent();
    }
}
