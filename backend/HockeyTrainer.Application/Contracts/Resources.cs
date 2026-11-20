using System.Text.Json.Serialization;

namespace HockeyTrainer.Application.Contracts;

public sealed record CategoryResponse(string Id, string Name);
public sealed record CopyDestinationRequest(Guid OrganisationId, Guid? TeamId);
public sealed record AgeGroupResponse(string Id, string Name, int SortOrder);
public sealed record CatalogResponse(IReadOnlyList<CategoryResponse> Categories, IReadOnlyList<AgeGroupResponse> AgeGroups);
public sealed record Point(double X, double Y);
public sealed record DiagramObject(string Id, string Type, double X, double Y, double Rotation, string Color, string Label = "");
public sealed record DiagramPath(string Id, string Kind, List<Point> Points, string Color);
public sealed record SkatingPass(string ReceiverActionId, double ReleaseFraction, double? ReceiveFraction = null, double? FlightSeconds = null);
public sealed record SkatingPassChain(string PuckId, List<SkatingPass> Passes);
public sealed record AnimationAction(string Id, string ObjectId, string PathId, double DurationSeconds, string? PuckId = null, bool StartWithPrevious = false, SkatingPassChain? SkatingPassChain = null);
public sealed record DrillAnimation(int Version, List<AnimationAction> Actions);
public sealed record Diagram(int Version, List<DiagramObject> Objects, List<DiagramPath> Paths, DrillAnimation? Animation = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? RinkSize = null);
public sealed record DrillRequest(string Title, string CategoryId, string Notes = "", Diagram? Diagram = null, List<string>? Tags = null, string? AgeGroup = null, List<string>? AgeGroups = null);
public sealed record DrillResponse(Guid Id, string Title, string CategoryId, string Notes, Diagram Diagram, DateTimeOffset UpdatedAt, List<string> Tags, string AgeGroup = "", OwnershipResponse? Ownership = null, List<string>? AgeGroups = null);
public sealed record TrainingItem(Guid DrillId, int DurationMinutes, string Notes = "", bool RunInParallelWithPrevious = false);
public sealed record TrainingRequest(string Title, string Notes = "", List<TrainingItem>? Items = null, List<string>? Tags = null, string? AgeGroup = null, List<string>? AgeGroups = null);
public sealed record TrainingResponse(Guid Id, string Title, string Notes, List<TrainingItem> Items, DateTimeOffset UpdatedAt, List<string> Tags, string AgeGroup = "", OwnershipResponse? Ownership = null, List<string>? AgeGroups = null);
