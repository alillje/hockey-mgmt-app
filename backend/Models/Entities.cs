namespace HockeyTrainer.Api.Models;

public sealed class Drill
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string CategoryId { get; set; } = "";
    public string Notes { get; set; } = "";
    public string DiagramJson { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
}

public sealed class Training
{
    public Guid Id { get; set; }
    public string Title { get; set; } = "";
    public string Notes { get; set; } = "";

    public DateTimeOffset UpdatedAt { get; set; }
    public List<TrainingEntry> Items { get; set; } = [];
}

public sealed class TrainingEntry
{
    public int Id { get; set; }
    public Guid TrainingId { get; set; }
    public Guid DrillId { get; set; }
    public Drill Drill { get; set; } = null!;
    public int Position { get; set; }
    public int DurationMinutes { get; set; }
    public string Notes { get; set; } = "";
}
