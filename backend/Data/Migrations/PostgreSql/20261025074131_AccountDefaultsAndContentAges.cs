using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Api.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class AccountDefaultsAndContentAges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AgeGroupsJson",
                schema: "hockey",
                table: "Trainings",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "AgeGroupsJson",
                schema: "hockey",
                table: "Drills",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateTable(
                name: "UserPreferences",
                schema: "hockey",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    DefaultTeamId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserPreferences", x => x.UserId);
                    table.ForeignKey(
                        name: "FK_UserPreferences_Teams_DefaultTeamId",
                        column: x => x.DefaultTeamId,
                        principalSchema: "hockey",
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_UserPreferences_DefaultTeamId",
                schema: "hockey",
                table: "UserPreferences",
                column: "DefaultTeamId");
            migrationBuilder.Sql("""
                UPDATE hockey."Drills" SET "AgeGroupsJson" = jsonb_build_array("AgeGroup")::text WHERE "AgeGroup" <> '';
                UPDATE hockey."Trainings" SET "AgeGroupsJson" = jsonb_build_array("AgeGroup")::text WHERE "AgeGroup" <> '';
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserPreferences",
                schema: "hockey");

            migrationBuilder.DropColumn(
                name: "AgeGroupsJson",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "AgeGroupsJson",
                schema: "hockey",
                table: "Drills");
        }
    }
}
