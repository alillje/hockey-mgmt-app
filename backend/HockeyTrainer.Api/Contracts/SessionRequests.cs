using System.ComponentModel.DataAnnotations;

namespace HockeyTrainer.Api.Contracts;

public sealed record SendSignInEmailRequest(
    [Required, EmailAddress, StringLength(254)] string Email);

public sealed record VerifySignInRequest(
    [Required, EmailAddress, StringLength(254)] string Email,
    [Required, RegularExpression("^[0-9]{6,10}$")] string Code);
