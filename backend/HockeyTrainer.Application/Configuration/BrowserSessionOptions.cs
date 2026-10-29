namespace HockeyTrainer.Application.Configuration;

public sealed class BrowserSessionOptions
{
    public string KeyRingPath { get; set; } = string.Empty;
    public int IdleHours { get; set; } = 24;
    public int MaximumDays { get; set; } = 7;
}
