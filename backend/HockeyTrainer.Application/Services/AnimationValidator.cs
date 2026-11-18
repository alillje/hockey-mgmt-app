using HockeyTrainer.Application.Contracts;

namespace HockeyTrainer.Application.Services;

public static class AnimationValidator
{
    private const int MaximumActions = 24;
    private const int MaximumSeconds = 30;

    public static void Validate(Diagram diagram)
    {
        var animation = diagram.Animation;
        if (animation is null)
        {
            return;
        }
        Require(animation.Version == 1, "Animation version must be 1.");
        Require(animation.Actions is not null && animation.Actions.Count is >= 1 and <= MaximumActions, $"Animation requires 1–{MaximumActions} actions.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var total = 0d;
        foreach (var action in animation.Actions!)
        {
            Require(action is not null, "Animation actions cannot be null.");
            Require(Guid.TryParse(action!.Id, out var id) && id != Guid.Empty && ids.Add(id.ToString()), "Animation action IDs must be unique UUIDs.");
            Require(double.IsFinite(action.DurationSeconds) && action.DurationSeconds is >= 0.5 and <= 10, "Action duration must be between 0.5 and 10 seconds.");
            total += action.DurationSeconds;
            var actor = diagram.Objects.SingleOrDefault(item => item.Id == action.ObjectId);
            var path = diagram.Paths.SingleOrDefault(item => item.Id == action.PathId);
            Require(actor is not null && path is not null, "Animation references an unavailable object or route. Remove or update the action first.");
            var skating = path!.Kind is "skating" or "skatingBackward" or "puckHandling";
            var puckRoute = path.Kind is "passing" or "shooting";
            Require((skating && actor!.Type == "player") || (puckRoute && actor!.Type is "player" or "puck"), "Only players/coaches and individual pucks can be animated; skating requires a player or coach.");
            var needsPuck = actor!.Type == "player" && (path.Kind == "puckHandling" || puckRoute);
            if (needsPuck)
            {
                Require(diagram.Objects.Any(item => item.Id == action.PuckId && item.Type == "puck"), "Carrying, passing or shooting a puck with a player/coach requires an individual puck object.");
            }
            else
            {
                Require(action.PuckId is null, "Only player/coach actions carrying, passing or shooting may select a separate puck.");
            }
        }
        Require(total <= MaximumSeconds, $"Animations can last at most {MaximumSeconds} seconds.");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition)
        {
            throw new ApiException(400, "Invalid animation", message);
        }
    }
}
