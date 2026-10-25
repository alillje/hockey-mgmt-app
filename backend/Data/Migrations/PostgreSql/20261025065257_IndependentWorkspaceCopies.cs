using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Api.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class IndependentWorkspaceCopies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                LOCK TABLE hockey."Drills", hockey."Trainings", hockey."TrainingEntries" IN SHARE ROW EXCLUSIVE MODE;

                -- Fail before changing any content if the legacy graph cannot be migrated without widening access.
                DO $preflight$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM hockey."TrainingEntries" e
                        LEFT JOIN hockey."Trainings" p ON p."Id" = e."TrainingId"
                        LEFT JOIN hockey."Drills" d ON d."Id" = e."DrillId"
                        WHERE p."Id" IS NULL OR d."Id" IS NULL OR p."OrganisationId" <> d."OrganisationId"
                           OR ((p."OwnerTeamId" IS DISTINCT FROM d."OwnerTeamId"
                                OR (p."OwnerTeamId" IS NOT NULL AND p."Visibility" = 'organisation'))
                               AND d."OwnerTeamId" IS NOT NULL AND d."Visibility" <> 'organisation')
                    ) OR EXISTS (
                        SELECT 1 FROM (
                            SELECT "OrganisationId", "OwnerTeamId", "Visibility" FROM hockey."Drills"
                            UNION ALL SELECT "OrganisationId", "OwnerTeamId", "Visibility" FROM hockey."Trainings"
                        ) c LEFT JOIN hockey."Organisations" o ON o."Id" = c."OrganisationId"
                        LEFT JOIN hockey."Teams" t ON t."Id" = c."OwnerTeamId" AND t."OrganisationId" = c."OrganisationId"
                        WHERE o."Id" IS NULL OR (c."OwnerTeamId" IS NOT NULL AND t."Id" IS NULL)
                           OR c."Visibility" NOT IN ('team', 'organisation')
                           OR (c."OwnerTeamId" IS NULL AND c."Visibility" <> 'organisation')
                    ) THEN
                        RAISE EXCEPTION 'Independent-copy migration blocked: ambiguous ownership or a private/cross-organisation drill reference needs owner review. No content was reassigned. See docs/independent-copies.md.';
                    END IF;
                END;
                $preflight$;

                -- A deterministic mapping exists only during this migration, never for normal copy operations.
                CREATE TEMP TABLE workspace_drill_copies ON COMMIT DROP AS
                WITH required AS (
                    SELECT d."Id" AS source_id, d."OrganisationId" AS organisation_id, NULL::uuid AS team_id
                    FROM hockey."Drills" d WHERE d."OwnerTeamId" IS NOT NULL AND d."Visibility" = 'organisation'
                    UNION
                    SELECT d."Id", p."OrganisationId", NULL::uuid
                    FROM hockey."TrainingEntries" e JOIN hockey."Trainings" p ON p."Id" = e."TrainingId"
                    JOIN hockey."Drills" d ON d."Id" = e."DrillId"
                    WHERE p."OwnerTeamId" IS NOT NULL AND p."Visibility" = 'organisation'
                    UNION
                    SELECT d."Id", p."OrganisationId", p."OwnerTeamId"
                    FROM hockey."TrainingEntries" e JOIN hockey."Trainings" p ON p."Id" = e."TrainingId"
                    JOIN hockey."Drills" d ON d."Id" = e."DrillId"
                    WHERE p."OwnerTeamId" IS DISTINCT FROM d."OwnerTeamId"
                )
                SELECT *, md5('workspace-drill:' || organisation_id::text || ':' || coalesce(team_id::text, 'library') || ':' || source_id::text)::uuid AS copy_id
                FROM required;

                INSERT INTO hockey."Drills" ("Id", "OrganisationId", "OwnerTeamId", "OriginTeamId", "CreatedByUserId", "Visibility", "AgeGroup", "Title", "CategoryId", "Notes", "TagsJson", "DiagramJson", "UpdatedAt")
                SELECT m.copy_id, m.organisation_id, m.team_id, coalesce(d."OwnerTeamId", d."OriginTeamId"), d."CreatedByUserId",
                    CASE WHEN m.team_id IS NULL THEN 'organisation' ELSE 'team' END,
                    d."AgeGroup", d."Title", d."CategoryId", d."Notes", d."TagsJson", d."DiagramJson", d."UpdatedAt"
                FROM workspace_drill_copies m JOIN hockey."Drills" d ON d."Id" = m.source_id;

                CREATE TEMP TABLE workspace_plan_copies ON COMMIT DROP AS
                SELECT "Id" AS source_id, md5('library-plan:' || "Id"::text)::uuid AS copy_id
                FROM hockey."Trainings" WHERE "OwnerTeamId" IS NOT NULL AND "Visibility" = 'organisation';

                INSERT INTO hockey."Trainings" ("Id", "OrganisationId", "OwnerTeamId", "OriginTeamId", "CreatedByUserId", "Visibility", "AgeGroup", "Title", "Notes", "TagsJson", "UpdatedAt")
                SELECT m.copy_id, p."OrganisationId", NULL, p."OwnerTeamId", p."CreatedByUserId", 'organisation',
                    p."AgeGroup", p."Title", p."Notes", p."TagsJson", p."UpdatedAt"
                FROM workspace_plan_copies m JOIN hockey."Trainings" p ON p."Id" = m.source_id;

                INSERT INTO hockey."TrainingEntries" ("TrainingId", "DrillId", "Position", "DurationMinutes", "Notes")
                SELECT p.copy_id, d.copy_id, e."Position", e."DurationMinutes", e."Notes"
                FROM workspace_plan_copies p JOIN hockey."TrainingEntries" e ON e."TrainingId" = p.source_id
                JOIN workspace_drill_copies d ON d.source_id = e."DrillId" AND d.team_id IS NULL;

                UPDATE hockey."TrainingEntries" e SET "DrillId" = m.copy_id
                FROM hockey."Trainings" p, hockey."Drills" d, workspace_drill_copies m
                WHERE e."TrainingId" = p."Id" AND e."DrillId" = d."Id"
                    AND p."OwnerTeamId" IS DISTINCT FROM d."OwnerTeamId"
                    AND m.source_id = d."Id" AND m.organisation_id = p."OrganisationId"
                    AND m.team_id IS NOT DISTINCT FROM p."OwnerTeamId";
                """);

            migrationBuilder.DropIndex(
                name: "IX_Trainings_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropIndex(
                name: "IX_Drills_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "Visibility",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "Visibility",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.CreateIndex(
                name: "IX_Trainings_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Trainings",
                columns: new[] { "OrganisationId", "OwnerTeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_Drills_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Drills",
                columns: new[] { "OrganisationId", "OwnerTeamId" });
            migrationBuilder.Sql("""
                CREATE FUNCTION hockey.enforce_plan_workspace() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog, hockey AS $guard$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM hockey."Trainings" p JOIN hockey."Drills" d ON d."Id" = NEW."DrillId"
                        WHERE p."Id" = NEW."TrainingId" AND p."OrganisationId" = d."OrganisationId"
                        AND p."OwnerTeamId" IS NOT DISTINCT FROM d."OwnerTeamId"
                    ) THEN
                        RAISE EXCEPTION 'Plan and drill must belong to the same workspace' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END;
                $guard$;
                CREATE TRIGGER training_entry_workspace BEFORE INSERT OR UPDATE ON hockey."TrainingEntries"
                FOR EACH ROW EXECUTE FUNCTION hockey.enforce_plan_workspace();
                CREATE FUNCTION hockey.prevent_workspace_move() RETURNS trigger
                LANGUAGE plpgsql SET search_path = pg_catalog, hockey AS $guard$
                BEGIN
                    IF OLD."OrganisationId" IS DISTINCT FROM NEW."OrganisationId"
                        OR OLD."OwnerTeamId" IS DISTINCT FROM NEW."OwnerTeamId" THEN
                        RAISE EXCEPTION 'Copy content to change workspace' USING ERRCODE = '23514';
                    END IF;
                    RETURN NEW;
                END;
                $guard$;
                CREATE TRIGGER drill_workspace_immutable BEFORE UPDATE ON hockey."Drills"
                FOR EACH ROW EXECUTE FUNCTION hockey.prevent_workspace_move();
                CREATE TRIGGER plan_workspace_immutable BEFORE UPDATE ON hockey."Trainings"
                FOR EACH ROW EXECUTE FUNCTION hockey.prevent_workspace_move();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException("Independent workspace copies cannot be merged safely. Restore a reviewed backup instead of reverting this migration.");
        }
    }
}
