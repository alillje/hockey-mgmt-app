namespace HockeyTrainer.Api.Services;

public sealed class ApiException(int statusCode, string title, string? detail = null) : Exception(detail ?? title)
{
    public int StatusCode { get; } = statusCode;
    public string Title { get; } = title;
}
