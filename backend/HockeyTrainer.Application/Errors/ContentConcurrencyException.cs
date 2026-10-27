namespace HockeyTrainer.Application.Errors;

public sealed class ContentConcurrencyException() : Exception(
    "Another operation changed this content. Reload and try again.");
