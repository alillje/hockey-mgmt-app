using System.Text.RegularExpressions;
using HockeyTrainer.Api.Contracts;

namespace HockeyTrainer.Api.Services;

public static partial class RequestValidator
{
    public static void Validate(DrillRequest request)
    {
        ValidateText(request.Title, request.Notes);
        Require(Catalog.Categories.Any(c => c.Id == request.CategoryId), "Choose a valid categoryId.");
        var diagram = request.Diagram;
        Require(diagram is not null, "A diagram is required (empty objects and paths are allowed).");
        Require(diagram!.Version == 1, "Diagram version must be 1.");
        Require(diagram.Objects is not null && diagram.Paths is not null, "Diagram objects and paths must be arrays.");
        Require(diagram.Objects!.Count <= 200 && diagram.Paths!.Count <= 100, "A diagram can contain at most 200 objects and 100 paths.");
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in diagram.Objects)
        {
            Require(item is not null, "Diagram objects cannot be null.");
            ValidateId(item!.Id, ids);
            Require(new[] { "cone", "goal", "tire", "smallTire", "player", "puck", "puckPile" }.Contains(item.Type), "Unknown diagram object type.");
            ValidatePoint(item.X, item.Y);
            Require(double.IsFinite(item.Rotation), "Rotation must be finite.");
            ValidateColor(item.Color);
            Require((item.Label?.Length ?? 0) <= 40, "Object labels must be at most 40 characters.");
        }
        foreach (var path in diagram.Paths!)
        {
            Require(path is not null, "Diagram paths cannot be null.");
            ValidateId(path!.Id, ids);
            Require(new[] { "skating", "passing", "puckHandling" }.Contains(path.Kind), "Unknown path kind.");
            Require(path.Points is not null && path.Points.Count >= 2 && path.Points.Count <= 500, "Paths require between 2 and 500 points.");
            ValidateColor(path.Color);
            foreach (var point in path.Points!)
            {
                Require(point is not null, "Path points cannot be null.");
                ValidatePoint(point!.X, point.Y);
            }
        }
    }

    public static void Validate(TrainingRequest request)
    {
        ValidateText(request.Title, request.Notes);
        Require(request.Items is not null && request.Items.Count <= 100, "Items must be an array with at most 100 entries.");
        foreach (var item in request.Items!)
        {
            Require(item is not null, "Training items cannot be null.");
            Require(item!.DrillId != Guid.Empty, "Each training item requires a drillId.");
            Require(item.DurationMinutes is > 0 and <= 240, "Duration must be a whole number between 1 and 240 minutes.");
            Require((item.Notes?.Length ?? 0) <= 6000, "Item notes must be at most 6000 characters.");
        }
    }

    private static void ValidateText(string title, string notes)
    {
        Require(!string.IsNullOrWhiteSpace(title) && title.Trim().Length <= 120, "Title is required and must be at most 120 characters.");
        Require((notes?.Length ?? 0) <= 6000, "Notes must be at most 6000 characters.");
    }

    private static void ValidateId(string id, HashSet<string> ids) => Require(Guid.TryParse(id, out var guid) && guid != Guid.Empty && ids.Add(guid.ToString()), "Diagram elements require unique UUID ids.");

    private static void ValidatePoint(double x, double y) => Require(double.IsFinite(x) && double.IsFinite(y) && x >= 0 && x <= 1000 && y >= 0 && y <= 500, "Coordinates must lie within the 1000 × 500 rink.");

    private static void ValidateColor(string color) => Require(color is not null && HexColor().IsMatch(color), "Colors must use six-digit hex notation, for example #2563eb.");

    private static void Require(bool valid, string detail)
    {
        if (!valid)
        {
            throw new ApiException(400, "Invalid request", detail);
        }
    }
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}
