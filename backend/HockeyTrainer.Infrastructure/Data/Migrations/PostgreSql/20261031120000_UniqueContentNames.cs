using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql;

/// <inheritdoc />
public partial class UniqueContentNames : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        RenameDuplicates(migrationBuilder, "Drills");
        RenameDuplicates(migrationBuilder, "Trainings");

        migrationBuilder.Sql("""
            CREATE UNIQUE INDEX "UX_Drills_Workspace_NormalizedTitle"
            ON hockey."Drills" ("OrganisationId", "OwnerTeamId", (lower(btrim("Title")))) WHERE "OwnerTeamId" IS NOT NULL;
            CREATE UNIQUE INDEX "UX_Drills_Library_NormalizedTitle"
            ON hockey."Drills" ("OrganisationId", (lower(btrim("Title")))) WHERE "OwnerTeamId" IS NULL;
            CREATE UNIQUE INDEX "UX_Trainings_Workspace_NormalizedTitle"
            ON hockey."Trainings" ("OrganisationId", "OwnerTeamId", (lower(btrim("Title")))) WHERE "OwnerTeamId" IS NOT NULL;
            CREATE UNIQUE INDEX "UX_Trainings_Library_NormalizedTitle"
            ON hockey."Trainings" ("OrganisationId", (lower(btrim("Title")))) WHERE "OwnerTeamId" IS NULL;
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP INDEX IF EXISTS hockey."UX_Drills_Workspace_NormalizedTitle";
            DROP INDEX IF EXISTS hockey."UX_Drills_Library_NormalizedTitle";
            DROP INDEX IF EXISTS hockey."UX_Trainings_Workspace_NormalizedTitle";
            DROP INDEX IF EXISTS hockey."UX_Trainings_Library_NormalizedTitle";
            """);
    }

    private static void RenameDuplicates(MigrationBuilder migrationBuilder, string table)
    {
        migrationBuilder.Sql($"""
            DO $unique_names$
            DECLARE
                duplicate RECORD;
                copy_number integer;
                suffix text;
                candidate text;
            BEGIN
                FOR duplicate IN
                    SELECT content."Id", content."OrganisationId", content."OwnerTeamId", content."Title", content.duplicate_rank
                    FROM (
                        SELECT "Id", "OrganisationId", "OwnerTeamId", "Title",
                            row_number() OVER (
                                PARTITION BY "OrganisationId", "OwnerTeamId", lower(btrim("Title"))
                                ORDER BY "UpdatedAt", "Id"
                            ) AS duplicate_rank
                        FROM hockey."{table}"
                    ) AS content
                    WHERE content.duplicate_rank > 1
                    ORDER BY content."OrganisationId", content."OwnerTeamId", content."Title", content."Id"
                LOOP
                    copy_number := 1;
                    LOOP
                        suffix := CASE WHEN copy_number = 1 THEN ' - Copy' ELSE ' - Copy (' || copy_number || ')' END;
                        candidate := left(btrim(duplicate."Title"), 120 - char_length(suffix)) || suffix;
                        EXIT WHEN NOT EXISTS (
                            SELECT 1 FROM hockey."{table}" AS existing
                            WHERE existing."OrganisationId" = duplicate."OrganisationId"
                                AND existing."OwnerTeamId" IS NOT DISTINCT FROM duplicate."OwnerTeamId"
                                AND existing."Id" <> duplicate."Id"
                                AND lower(btrim(existing."Title")) = lower(btrim(candidate))
                        );
                        copy_number := copy_number + 1;
                    END LOOP;

                    UPDATE hockey."{table}"
                    SET "Title" = candidate
                    WHERE "Id" = duplicate."Id";
                END LOOP;
            END $unique_names$;
            """);
    }
}
