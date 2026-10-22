using HockeyTrainer.Api.Data;
using HockeyTrainer.Api.Repositories;
using HockeyTrainer.Api.Services;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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

var databasePath = builder.Configuration["DatabasePath"] ?? "App_Data/hockey.db";
if (!Path.IsPathRooted(databasePath)) databasePath = Path.Combine(builder.Environment.ContentRootPath, databasePath);
Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
builder.Services.AddDbContext<HockeyDbContext>(options => options.UseSqlite($"Data Source={databasePath}"));
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
app.MapControllers();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<HockeyDbContext>();
    if (await db.Database.EnsureCreatedAsync())
        await DatabaseSeeder.SeedAsync(scope.ServiceProvider);
}
app.Run();

public partial class Program;
