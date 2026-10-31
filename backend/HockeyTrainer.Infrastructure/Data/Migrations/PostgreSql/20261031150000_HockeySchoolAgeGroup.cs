using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class HockeySchoolAgeGroup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "hockey",
                table: "AgeGroups",
                columns: new[] { "Id", "Name", "SortOrder" },
                values: new object[] { "HockeySchool", "Hockey School", 0 });

            migrationBuilder.Sql(NormalizeAgeGroupsSql("Drills"));
            migrationBuilder.Sql(NormalizeAgeGroupsSql("Trainings"));
            migrationBuilder.Sql(MoveToAgeGroupSql("Drills", includeCategory: true));
            migrationBuilder.Sql(MoveToAgeGroupSql("Trainings", includeCategory: false));
            migrationBuilder.Sql(UpdateLegacyAgeGroupSql("Drills"));
            migrationBuilder.Sql(UpdateLegacyAgeGroupSql("Trainings"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(MoveToCategorySql("Drills", includeCategory: true));
            migrationBuilder.Sql(MoveToCategorySql("Trainings", includeCategory: false));
            migrationBuilder.Sql(RemoveHockeySchoolAgeSql("Drills"));
            migrationBuilder.Sql(RemoveHockeySchoolAgeSql("Trainings"));
            migrationBuilder.Sql(RestoreLegacyAgeGroupSql("Drills"));
            migrationBuilder.Sql(RestoreLegacyAgeGroupSql("Trainings"));

            migrationBuilder.DeleteData(
                schema: "hockey",
                table: "AgeGroups",
                keyColumn: "Id",
                keyValue: "HockeySchool");
        }

        private static string NormalizeAgeGroupsSql(string tableName) => $$"""
            UPDATE hockey."{{tableName}}" AS content
            SET "AgeGroupsJson" = COALESCE((
                SELECT jsonb_agg(to_jsonb(ages.value) ORDER BY ages.first_position)
                FROM (
                    SELECT CASE
                        WHEN lower(btrim(age.value)) IN ('hockey school', 'hockey-school', 'hockeyschool') THEN 'HockeySchool'
                        ELSE age.value
                    END AS value,
                    MIN(age.ordinality) AS first_position
                    FROM jsonb_array_elements_text(content."AgeGroupsJson"::jsonb)
                        WITH ORDINALITY AS age(value, ordinality)
                    GROUP BY CASE
                        WHEN lower(btrim(age.value)) IN ('hockey school', 'hockey-school', 'hockeyschool') THEN 'HockeySchool'
                        ELSE age.value
                    END
                ) AS ages
            ), '[]'::jsonb)::text;
            """;

        private static string MoveToAgeGroupSql(string tableName, bool includeCategory)
        {
            var categoryPredicate = includeCategory
                ? " OR lower(btrim(content.\"CategoryId\")) IN ('hockey school', 'hockey-school', 'hockeyschool')"
                : string.Empty;
            var categoryUpdate = includeCategory
                ? ", \"CategoryId\" = CASE WHEN lower(btrim(content.\"CategoryId\")) IN ('hockey school', 'hockey-school', 'hockeyschool') THEN 'other' ELSE content.\"CategoryId\" END"
                : string.Empty;

            return $$"""
                UPDATE hockey."{{tableName}}" AS content
                SET "AgeGroupsJson" = CASE
                        WHEN (
                            EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements_text(content."TagsJson"::jsonb) AS tag(value)
                                WHERE lower(btrim(tag.value)) IN ('hockey school', 'hockey-school', 'hockeyschool')
                            )
                            OR lower(btrim(content."AgeGroup")) IN ('hockey school', 'hockey-school', 'hockeyschool')
                            {{categoryPredicate}}
                        ) AND NOT (content."AgeGroupsJson"::jsonb ? 'HockeySchool')
                        THEN (content."AgeGroupsJson"::jsonb || '["HockeySchool"]'::jsonb)::text
                        ELSE content."AgeGroupsJson"
                    END,
                    "TagsJson" = COALESCE((
                        SELECT jsonb_agg(to_jsonb(tag.value) ORDER BY tag.ordinality)
                        FROM jsonb_array_elements_text(content."TagsJson"::jsonb)
                            WITH ORDINALITY AS tag(value, ordinality)
                        WHERE lower(btrim(tag.value)) NOT IN ('hockey school', 'hockey-school', 'hockeyschool')
                    ), '[]'::jsonb)::text{{categoryUpdate}};
                """;
        }

        private static string UpdateLegacyAgeGroupSql(string tableName) => $$"""
            UPDATE hockey."{{tableName}}" AS content
            SET "AgeGroup" = (
                SELECT selected.value
                FROM jsonb_array_elements_text(content."AgeGroupsJson"::jsonb)
                    WITH ORDINALITY AS selected(value, ordinality)
                ORDER BY selected.ordinality
                LIMIT 1
            )
            WHERE lower(btrim(content."AgeGroup")) IN ('hockey school', 'hockey-school', 'hockeyschool')
                OR (content."AgeGroup" = '' AND content."AgeGroupsJson"::jsonb ? 'HockeySchool');
            """;

        private static string MoveToCategorySql(string tableName, bool includeCategory)
        {
            var categoryUpdate = includeCategory
                ? ", \"CategoryId\" = CASE WHEN content.\"AgeGroupsJson\"::jsonb ? 'HockeySchool' THEN 'hockey-school' ELSE content.\"CategoryId\" END"
                : string.Empty;

            return $$"""
                UPDATE hockey."{{tableName}}" AS content
                SET "TagsJson" = CASE
                        WHEN content."AgeGroupsJson"::jsonb ? 'HockeySchool'
                            AND NOT EXISTS (
                                SELECT 1
                                FROM jsonb_array_elements_text(content."TagsJson"::jsonb) AS tag(value)
                                WHERE lower(btrim(tag.value)) IN ('hockey school', 'hockey-school', 'hockeyschool')
                            )
                        THEN (content."TagsJson"::jsonb || '["Hockey School"]'::jsonb)::text
                        ELSE content."TagsJson"
                    END{{categoryUpdate}};
                """;
        }

        private static string RemoveHockeySchoolAgeSql(string tableName) => $$"""
            UPDATE hockey."{{tableName}}" AS content
            SET "AgeGroupsJson" = COALESCE((
                SELECT jsonb_agg(to_jsonb(age.value) ORDER BY age.ordinality)
                FROM jsonb_array_elements_text(content."AgeGroupsJson"::jsonb)
                    WITH ORDINALITY AS age(value, ordinality)
                WHERE age.value <> 'HockeySchool'
            ), '[]'::jsonb)::text;
            """;

        private static string RestoreLegacyAgeGroupSql(string tableName) => $$"""
            UPDATE hockey."{{tableName}}" AS content
            SET "AgeGroup" = COALESCE((
                SELECT selected.value
                FROM jsonb_array_elements_text(content."AgeGroupsJson"::jsonb)
                    WITH ORDINALITY AS selected(value, ordinality)
                ORDER BY selected.ordinality
                LIMIT 1
            ), '')
            WHERE content."AgeGroup" = 'HockeySchool';
            """;
    }
}
