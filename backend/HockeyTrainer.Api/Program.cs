using HockeyTrainer.Api.Authentication;
using HockeyTrainer.Application;
using HockeyTrainer.Application.Authentication;
using HockeyTrainer.Application.Configuration;
using HockeyTrainer.Application.Errors;
using HockeyTrainer.Infrastructure.Data;
using HockeyTrainer.Application.Services;
using HockeyTrainer.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment() &&
    builder.Configuration["Auth:Mode"]?.Equals("Supabase", StringComparison.OrdinalIgnoreCase) == true)
{
    var localSettings = Path.Combine(builder.Environment.ContentRootPath, "appsettings.Local.json");
    if (!File.Exists(localSettings))
    {
        localSettings = Path.Combine(Directory.GetCurrentDirectory(), "backend", "HockeyTrainer.Api", "appsettings.Local.json");
    }

    builder.Configuration.AddJsonFile(localSettings, optional: true, reloadOnChange: false);
    builder.Configuration.AddEnvironmentVariables();
}
var auth = AuthConfiguration.Load(builder.Configuration, builder.Environment);
builder.Services.AddSingleton(auth);
builder.Services.AddSingleton<IAuthenticationContext>(auth);
builder.Services.AddControllers();
builder.Services.Configure<WorkspaceOptions>(builder.Configuration.GetSection(WorkspaceOptions.SectionName));
builder.Services.AddProblemDetails();
builder.Services.AddAuthorization();
if (auth.Enabled)
{
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = auth.Issuer;
            options.RequireHttpsMetadata = true;
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = auth.Issuer,
                ValidateAudience = true,
                ValidAudience = "authenticated",
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.RsaSha256],
                NameClaimType = "email",
                RoleClaimType = "role",
                ClockSkew = TimeSpan.FromMinutes(1)
            };
            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    var claims = context.Principal;
                    if (claims?.FindFirst("role")?.Value != "authenticated" ||
                        claims.FindFirst("is_anonymous")?.Value == "true" ||
                        !Guid.TryParse(claims.FindFirst("sub")?.Value, out _))
                    {
                        context.Fail("The user is not authorized for this workspace.");
                    }

                    return Task.CompletedTask;
                }
            };
        });
}
builder.Services.Configure<ApiBehaviorOptions>(options => options.InvalidModelStateResponseFactory = context =>
    new BadRequestObjectResult(new ValidationProblemDetails(context.ModelState)
    {
        Status = 400,
        Title = "Invalid request",
        Detail = "Check the request fields and JSON format."
    }));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IWorkspaceRequestContext, WorkspaceRequestContext>();
builder.Services.AddHockeyApplication();
builder.Services.AddHockeyInfrastructure(builder.Configuration, builder.Environment);

var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var (statusCode, title, detail) = exception switch
    {
        ApiException apiException => (apiException.StatusCode, apiException.Title, apiException.Message),
        ContentConcurrencyException concurrencyException => (409, "Content changed", concurrencyException.Message),
        _ => (500, "Unexpected server error", "The request could not be completed.")
    };
    await Results.Problem(
        statusCode: statusCode,
        title: title,
        detail: detail).ExecuteAsync(context);
}));
app.UseDefaultFiles();
app.UseStaticFiles();
if (auth.Enabled)
{
    app.UseAuthentication();
}

app.UseAuthorization();
var controllers = app.MapControllers();
if (auth.Enabled)
{
    controllers.RequireAuthorization();
}
// Unknown API URLs must stay API errors, including when React has been published.
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");
using (var scope = app.Services.CreateScope())
{
    await DatabaseInitializer.InitializeAsync(scope.ServiceProvider);
}
app.Run();

public partial class Program;
