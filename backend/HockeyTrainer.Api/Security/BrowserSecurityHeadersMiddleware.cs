namespace HockeyTrainer.Api.Security;

public sealed class BrowserSecurityHeadersMiddleware(RequestDelegate next)
{
    // React uses inline style attributes for editor geometry. Scripts never need inline execution or eval.
    // PDF generation rasterises a local SVG blob and creates data images; neither is allowed as a script source.
    public const string ContentSecurityPolicy =
        "default-src 'none'; " +
        "script-src 'self'; script-src-attr 'none'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; " +
        "object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'; " +
        "form-action 'self'; worker-src 'none'";

    public async Task InvokeAsync(HttpContext context)
    {
        // Apply at response start so static files, deep links and handled errors all receive the headers.
        context.Response.OnStarting(() =>
        {
            context.Response.Headers.ContentSecurityPolicy = ContentSecurityPolicy;
            context.Response.Headers.XContentTypeOptions = "nosniff";
            context.Response.Headers.XFrameOptions = "DENY";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";

            return Task.CompletedTask;
        });
        await next(context);
    }
}
