using Microsoft.AspNetCore.Antiforgery;

namespace HockeyTrainer.Api.Authentication;

public sealed class CsrfProtectionMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IAntiforgery antiforgery)
    {
        if (context.Request.Path.StartsWithSegments("/api"))
        {
            context.Response.Headers.CacheControl = "no-store";
            if (!HttpMethods.IsGet(context.Request.Method) &&
                !HttpMethods.IsHead(context.Request.Method) &&
                !HttpMethods.IsOptions(context.Request.Method))
            {
                try
                {
                    await antiforgery.ValidateRequestAsync(context);
                }
                catch (AntiforgeryValidationException)
                {
                    await Results.Problem(statusCode: 400, title: "Invalid CSRF token",
                        detail: "Refresh the page and try again.").ExecuteAsync(context);

                    return;
                }
            }
        }
        await next(context);
    }
}
