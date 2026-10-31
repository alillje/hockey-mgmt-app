using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[ResponseCache(Location = ResponseCacheLocation.None, NoStore = true)]
[Route("api/account/profile")]
public sealed class AccountProfileController(UserProfileService userProfileService) : ControllerBase
{
    [HttpGet]
    public Task<UserProfileResponse> Get(CancellationToken cancellationToken) => userProfileService.GetAsync(cancellationToken);

    [HttpPut]
    public Task<UserProfileResponse> Save(UserProfileRequest request, CancellationToken cancellationToken) =>
        userProfileService.SaveAsync(request, cancellationToken);
}
