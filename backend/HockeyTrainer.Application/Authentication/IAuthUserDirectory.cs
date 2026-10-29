namespace HockeyTrainer.Application.Authentication;

public interface IAuthUserDirectory
{
    Task<Guid?> FindByEmailAsync(string normalizedEmail, CancellationToken cancellationToken);
}
