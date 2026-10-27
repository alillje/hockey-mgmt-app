using HockeyTrainer.Api.Contracts;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace HockeyTrainer.Api.Controllers;

[ApiController]
[Route("api/account/preferences")]
public sealed class AccountController(AccountService accountService) : ControllerBase
{
    [HttpGet]
    public Task<AccountPreferencesResponse> Get(CancellationToken cancellationToken) => accountService.GetAsync(cancellationToken);

    [HttpPut]
    public Task<AccountPreferencesResponse> Save(AccountPreferencesRequest request, CancellationToken cancellationToken) => accountService.SaveAsync(request, cancellationToken);
}
