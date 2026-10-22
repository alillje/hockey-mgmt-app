using HockeyTrainer.Api.Contracts;

namespace HockeyTrainer.Api.Services;

public static class Catalog
{
    public static IReadOnlyList<CategoryResponse> Categories { get; } =
    [
        new("skating", "Skating"), new("stick-handling", "Stick handling"),
        new("passing", "Passing"), new("shooting", "Shooting"),
        new("tactics", "Tactics"), new("warm-up", "Warm-up"), new("other", "Other")
    ];
}
