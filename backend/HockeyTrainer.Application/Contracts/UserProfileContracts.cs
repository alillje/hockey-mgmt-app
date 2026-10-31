namespace HockeyTrainer.Application.Contracts;

public sealed record UserProfileRequest(string FirstName, string LastName);
public sealed record UserProfileResponse(string FirstName, string LastName, string? Email, bool IsComplete);
public sealed record DirectoryMemberResponse(Guid UserId, string FirstName, string LastName, string Role);
public sealed record TeamDirectoryResponse(List<DirectoryMemberResponse> Members, List<DirectoryMemberResponse> Administrators);
