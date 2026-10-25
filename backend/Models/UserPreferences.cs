namespace HockeyTrainer.Api.Models;

public sealed class UserPreferences
{
    public Guid UserId { get; set; }
    public Guid? DefaultTeamId { get; set; }
}
