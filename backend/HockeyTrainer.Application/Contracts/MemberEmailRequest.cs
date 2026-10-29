using System.ComponentModel.DataAnnotations;

namespace HockeyTrainer.Application.Contracts;

public sealed record MemberEmailRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    string Role,
    Guid? TeamId = null,
    string TeamRole = "viewer");
