namespace HockeyTrainer.Infrastructure.Data;

// Database guards complement service authorisation; even a privileged runtime role cannot
// accidentally persist plan references across workspace boundaries.
public static class WorkspaceReferenceRules
{
    public const string Sqlite = """
        CREATE TRIGGER IF NOT EXISTS training_entry_workspace_insert BEFORE INSERT ON TrainingEntries
        WHEN NOT EXISTS (
            SELECT 1 FROM Trainings p JOIN Drills d ON d.Id = NEW.DrillId
            WHERE p.Id = NEW.TrainingId AND p.OrganisationId = d.OrganisationId
            AND p.OwnerTeamId IS d.OwnerTeamId
        ) BEGIN SELECT RAISE(ABORT, 'Plan and drill must belong to the same workspace'); END;
        CREATE TRIGGER IF NOT EXISTS training_entry_workspace_update BEFORE UPDATE ON TrainingEntries
        WHEN NOT EXISTS (
            SELECT 1 FROM Trainings p JOIN Drills d ON d.Id = NEW.DrillId
            WHERE p.Id = NEW.TrainingId AND p.OrganisationId = d.OrganisationId
            AND p.OwnerTeamId IS d.OwnerTeamId
        ) BEGIN SELECT RAISE(ABORT, 'Plan and drill must belong to the same workspace'); END;
        CREATE TRIGGER IF NOT EXISTS drill_workspace_immutable BEFORE UPDATE OF OrganisationId, OwnerTeamId ON Drills
        WHEN OLD.OrganisationId IS NOT NEW.OrganisationId OR OLD.OwnerTeamId IS NOT NEW.OwnerTeamId
        BEGIN SELECT RAISE(ABORT, 'Copy content to change workspace'); END;
        CREATE TRIGGER IF NOT EXISTS plan_workspace_immutable BEFORE UPDATE OF OrganisationId, OwnerTeamId ON Trainings
        WHEN OLD.OrganisationId IS NOT NEW.OrganisationId OR OLD.OwnerTeamId IS NOT NEW.OwnerTeamId
        BEGIN SELECT RAISE(ABORT, 'Copy content to change workspace'); END;
        """;
}
