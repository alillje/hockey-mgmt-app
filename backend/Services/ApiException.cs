namespace HockeyTrainer.Api.Services;

public sealed class ApiException : Exception
{
    public ApiException(int statusCode, string title, string? detail = null) : base(detail ?? title)
    {
        StatusCode = statusCode;
        Title = title;
    }

    public int StatusCode { get; }
    public string Title { get; }
}
