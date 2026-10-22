using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Repositories;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.Configure<ApiBehaviorOptions>(options => options.InvalidModelStateResponseFactory = context =>
    new BadRequestObjectResult(new ValidationProblemDetails(context.ModelState)
    {
        Status = 400,
        Title = "Invalid request",
        Detail = "Check the request fields and JSON format."
    }));

builder.Services.AddHockeyDatabase(builder.Configuration, builder.Environment);
builder.Services.AddScoped<DatabaseReadiness>();
builder.Services.AddScoped<IHockeyRepository, HockeyRepository>();
builder.Services.AddScoped<IHockeyService, HockeyService>();

var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var exception = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var apiException = exception as ApiException;
    await Results.Problem(
        statusCode: apiException?.StatusCode ?? 500,
        title: apiException?.Title ?? "Unexpected server error",
        detail: apiException?.Message ?? "The request could not be completed.").ExecuteAsync(context);
}));
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
// Unknown API URLs must stay API errors, including when React has been published.
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");
using (var scope = app.Services.CreateScope())
{
    await DatabaseInitializer.InitializeAsync(scope.ServiceProvider);
}
app.Run();

public partial class Program;
