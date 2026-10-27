using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/workspace")]
public sealed class WorkspaceController(WorkspaceService workspaceService, WorkspaceMembershipService membershipService) : ControllerBase
{
    [HttpGet]
    public Task<WorkspaceResponse> Get(CancellationToken cancellationToken) => workspaceService.GetAsync(cancellationToken);

    [HttpPost("organisations")]
    public Task<OrganisationResponse> CreateOrganisation(OrganisationRequest request, CancellationToken cancellationToken) =>
        workspaceService.CreateAsync(request, cancellationToken);

    [HttpPost("teams")]
    public Task<TeamResponse> CreateTeam(TeamRequest request, CancellationToken cancellationToken) => workspaceService.CreateTeamAsync(request, cancellationToken);

    [HttpGet("members")]
    public Task<List<MemberResponse>> Members(CancellationToken cancellationToken) => membershipService.MembersAsync(cancellationToken);

    [HttpPost("members")]
    public async Task<IActionResult> AddMember(MemberRequest request, CancellationToken cancellationToken)
    {
        await membershipService.AddMemberAsync(request, cancellationToken);

        return NoContent();
    }

    [HttpPut("members/{userId:guid}")]
    public async Task<IActionResult> UpdateMemberRole(Guid userId, MemberRoleRequest request, CancellationToken cancellationToken)
    {
        await membershipService.UpdateMemberRoleAsync(userId, request, cancellationToken);

        return NoContent();
    }

    [HttpDelete("members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid userId, CancellationToken cancellationToken)
    {
        await membershipService.RemoveMemberAsync(userId, cancellationToken);

        return NoContent();
    }

    [HttpPut("teams/{teamId:guid}/members/{userId:guid}")]
    public async Task<IActionResult> UpdateTeamMemberRole(Guid teamId, Guid userId, TeamMemberRoleRequest request, CancellationToken cancellationToken)
    {
        await membershipService.UpdateTeamMemberRoleAsync(teamId, userId, request, cancellationToken);

        return NoContent();
    }

    [HttpDelete("teams/{teamId:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveTeamMember(Guid teamId, Guid userId, CancellationToken cancellationToken)
    {
        await membershipService.RemoveTeamMemberAsync(teamId, userId, cancellationToken);

        return NoContent();
    }
}
