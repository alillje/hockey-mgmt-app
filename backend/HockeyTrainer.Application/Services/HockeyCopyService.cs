using HockeyTrainer.Application.Contracts;
using HockeyTrainer.Domain.Models;
using HockeyTrainer.Application.Repositories;

namespace HockeyTrainer.Application.Services;

public sealed class HockeyCopyService(IHockeyRepository repository, WorkspaceService workspaceService)
{
    public Task<DrillResponse> CopyDrillAsync(Guid id, bool toLibrary, CancellationToken ct) =>
        repository.ExecuteAsync(async () =>
        {
            var access = await workspaceService.AccessAsync(ct);
            var original = await FindDrillAsync(id, access, ct);
            var destinationTeamId = RequireCopy(original, access, toLibrary);
            var copy = CloneDrill(original, access, destinationTeamId);

            return HockeyContentMapper.Map(copy, access);
        }, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, bool toLibrary, CancellationToken ct) =>
        repository.ExecuteAsync(async () =>
        {
            var access = await workspaceService.AccessAsync(ct);
            var original = await FindTrainingAsync(id, access, ct);
            var destinationTeamId = RequireCopy(original, access, toLibrary);

            return await CloneTrainingAsync(original, access, destinationTeamId, ct);
        }, ct);

    public Task<DrillResponse> CopyDrillAsync(Guid id, CopyDestinationRequest destination, CancellationToken ct) =>
        repository.ExecuteAsync(async () =>
        {
            var access = await workspaceService.AccessAsync(ct);
            var original = await FindDrillAsync(id, access, ct);
            var destinationTeamId = RequireCopyDestination(original, access, destination);
            var copy = CloneDrill(original, access, destinationTeamId);

            return HockeyContentMapper.Map(copy, access);
        }, ct);

    public Task<TrainingResponse> CopyTrainingAsync(Guid id, CopyDestinationRequest destination, CancellationToken ct) =>
        repository.ExecuteAsync(async () =>
        {
            var access = await workspaceService.AccessAsync(ct);
            var original = await FindTrainingAsync(id, access, ct);
            var destinationTeamId = RequireCopyDestination(original, access, destination);

            return await CloneTrainingAsync(original, access, destinationTeamId, ct);
        }, ct);

    private async Task<TrainingResponse> CloneTrainingAsync(Training original, WorkspaceAccess access, Guid? destinationTeamId, CancellationToken ct)
    {
        var copiedDrills = new Dictionary<Guid, Guid>();
        foreach (var drillId in original.Items.Select(item => item.DrillId).Distinct().Order())
        {
            var drill = await FindDrillAsync(drillId, access, ct);
            if (!access.CanUseInPlan(drill, original.OwnerTeamId))
            {
                throw new ApiException(409, "Invalid plan reference", "Every included drill must belong to the source plan's workspace.");
            }

            copiedDrills.Add(drillId, CloneDrill(drill, access, destinationTeamId).Id);
        }

        var copy = new Training
        {
            Id = Guid.NewGuid(),
            Title = original.Title,
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            AgeGroup = original.AgeGroup,
            AgeGroupsJson = original.AgeGroupsJson,
            UpdatedAt = HockeyContentMapper.UtcNow(),
            Items = original.Items.OrderBy(item => item.Position).Select(item => new TrainingEntry
            {
                DrillId = copiedDrills[item.DrillId],
                Position = item.Position,
                DurationMinutes = item.DurationMinutes,
                Notes = item.Notes
            }).ToList()
        };
        SetCopyOwnership(copy, original, access, destinationTeamId);
        repository.Add(copy);

        return HockeyContentMapper.Map(copy, access);
    }

    private static Guid? RequireCopyDestination(IOwnedContent source, WorkspaceAccess access, CopyDestinationRequest destination)
    {
        if (destination.OrganisationId != access.OrganisationId)
        {
            throw new ApiException(403, "Copy destination denied", "Choose a destination in the source organisation.");
        }

        if (destination.TeamId is Guid teamId)
        {
            if (access.Teams.All(team => team.Id != teamId) || !access.CanEditTeam(teamId))
            {
                throw new ApiException(403, "Copy destination denied", "You need editing permission in the destination team.");
            }

            return teamId;
        }

        if (source.OwnerTeamId is Guid sourceTeamId ? !access.CanEditTeam(sourceTeamId) : !access.IsAdmin)
        {
            throw new ApiException(403, "Copy destination denied", "Only a source team coach or organisation administrator can contribute a club copy.");
        }

        return null;
    }

    private Drill CloneDrill(Drill original, WorkspaceAccess access, Guid? destinationTeamId)
    {
        var copy = new Drill
        {
            Id = Guid.NewGuid(),
            Title = original.Title,
            CategoryId = original.CategoryId,
            Notes = original.Notes,
            TagsJson = original.TagsJson,
            DiagramJson = original.DiagramJson,
            AgeGroup = original.AgeGroup,
            AgeGroupsJson = original.AgeGroupsJson,
            UpdatedAt = HockeyContentMapper.UtcNow()
        };
        SetCopyOwnership(copy, original, access, destinationTeamId);
        repository.Add(copy);

        return copy;
    }

    private static Guid? RequireCopy(IOwnedContent source, WorkspaceAccess access, bool toLibrary)
    {
        if (toLibrary)
        {
            if (source.OwnerTeamId is null || source.OwnerTeamId != access.TeamId || !access.CanEdit(source))
            {
                throw new ApiException(403, "Select your editable source team", "Only a coach of the selected team can contribute its content to the organisation library.");
            }

            return null;
        }

        if (source.OwnerTeamId is not null || access.TeamId is null || !access.CanEditTeam(access.TeamId))
        {
            throw new ApiException(403, "Select an editable destination team", "Only organisation-library content can be copied to your selected team.");
        }

        return access.TeamId;
    }

    private static void SetCopyOwnership(IOwnedContent copy, IOwnedContent source, WorkspaceAccess access, Guid? teamId)
    {
        copy.OrganisationId = access.OrganisationId;
        copy.OwnerTeamId = teamId;
        copy.OriginTeamId = source.OwnerTeamId ?? source.OriginTeamId;
        copy.CreatedByUserId = access.UserId;
    }

    private async Task<Drill> FindDrillAsync(Guid id, WorkspaceAccess access, CancellationToken ct)
    {
        var drill = await repository.GetDrillAsync(id, ct);

        return drill is not null && access.CanView(drill) ? drill : throw new ApiException(404, "Drill not found");
    }

    private async Task<Training> FindTrainingAsync(Guid id, WorkspaceAccess access, CancellationToken ct)
    {
        var training = await repository.GetTrainingAsync(id, ct);

        return training is not null && access.CanView(training) ? training : throw new ApiException(404, "Practice plan not found");
    }
}
