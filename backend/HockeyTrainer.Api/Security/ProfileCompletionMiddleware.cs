using HockeyTrainer.Application.Services;

namespace HockeyTrainer.Api.Security;

public sealed class ProfileCompletionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, UserProfileService userProfileService)
    {
        var path = context.Request.Path.Value?.TrimEnd('/') ?? string.Empty;
        var requiresProfile = path.StartsWith("/api/drills", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/trainings", StringComparison.OrdinalIgnoreCase) ||
            (path.StartsWith("/api/workspace", StringComparison.OrdinalIgnoreCase) &&
                !(HttpMethods.IsGet(context.Request.Method) && path.Equals("/api/workspace", StringComparison.OrdinalIgnoreCase)));
        if (requiresProfile && context.User.Identity?.IsAuthenticated == true &&
            !(await userProfileService.GetAsync(context.RequestAborted)).IsComplete)
        {
            await Results.Problem(statusCode: 403, title: "Profile required",
                detail: "Add your first and last name under Account to continue.").ExecuteAsync(context);

            return;
        }

        await next(context);
    }
}
