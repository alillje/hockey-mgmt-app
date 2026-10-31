using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Http;

namespace HockeyTrainer.Api.Authentication;

public sealed class WorkspaceRequestContext(IHttpContextAccessor httpContextAccessor) : IWorkspaceRequestContext
{
    public Guid? UserId => Guid.TryParse(httpContextAccessor.HttpContext?.User.FindFirst("sub")?.Value, out var userId)
        ? userId
        : null;

    public string? Email => httpContextAccessor.HttpContext?.User.FindFirst("email")?.Value;

    public string? OrganisationId => httpContextAccessor.HttpContext?.Request.Headers["X-Organisation-Id"].ToString();

    public string? TeamId => httpContextAccessor.HttpContext?.Request.Headers["X-Team-Id"].ToString();
}
