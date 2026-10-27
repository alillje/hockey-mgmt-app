using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class ClubLibraries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AgeGroup",
                schema: "hockey",
                table: "Trainings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                schema: "hockey",
                table: "Trainings",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000003"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganisationId",
                schema: "hockey",
                table: "Trainings",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000001"));

            migrationBuilder.AddColumn<Guid>(
                name: "OriginTeamId",
                schema: "hockey",
                table: "Trainings",
                type: "uuid",
                nullable: true,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000002"));

            migrationBuilder.AddColumn<Guid>(
                name: "OwnerTeamId",
                schema: "hockey",
                table: "Trainings",
                type: "uuid",
                nullable: true,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000002"));

            migrationBuilder.AddColumn<string>(
                name: "Visibility",
                schema: "hockey",
                table: "Trainings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "team");

            migrationBuilder.AddColumn<string>(
                name: "AgeGroup",
                schema: "hockey",
                table: "Drills",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                schema: "hockey",
                table: "Drills",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000003"));

            migrationBuilder.AddColumn<Guid>(
                name: "OrganisationId",
                schema: "hockey",
                table: "Drills",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000001"));

            migrationBuilder.AddColumn<Guid>(
                name: "OriginTeamId",
                schema: "hockey",
                table: "Drills",
                type: "uuid",
                nullable: true,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000002"));

            migrationBuilder.AddColumn<Guid>(
                name: "OwnerTeamId",
                schema: "hockey",
                table: "Drills",
                type: "uuid",
                nullable: true,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000002"));

            migrationBuilder.AddColumn<string>(
                name: "Visibility",
                schema: "hockey",
                table: "Drills",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "team");

            migrationBuilder.CreateTable(
                name: "Organisations",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organisations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "OrganisationMembers",
                schema: "hockey",
                columns: table => new
                {
                    OrganisationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrganisationMembers", x => new { x.OrganisationId, x.UserId });
                    table.ForeignKey(
                        name: "FK_OrganisationMembers_Organisations_OrganisationId",
                        column: x => x.OrganisationId,
                        principalSchema: "hockey",
                        principalTable: "Organisations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Teams",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganisationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    AgeGroup = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Teams", x => x.Id);
                    table.UniqueConstraint("AK_Teams_OrganisationId_Id", x => new { x.OrganisationId, x.Id });
                    table.ForeignKey(
                        name: "FK_Teams_Organisations_OrganisationId",
                        column: x => x.OrganisationId,
                        principalSchema: "hockey",
                        principalTable: "Organisations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TeamMembers",
                schema: "hockey",
                columns: table => new
                {
                    TeamId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeamMembers", x => new { x.TeamId, x.UserId });
                    table.ForeignKey(
                        name: "FK_TeamMembers_Teams_TeamId",
                        column: x => x.TeamId,
                        principalSchema: "hockey",
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "hockey",
                table: "Organisations",
                columns: new[] { "Id", "Name" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000001"), "Legacy workspace" });

            migrationBuilder.InsertData(
                schema: "hockey",
                table: "OrganisationMembers",
                columns: new[] { "OrganisationId", "UserId", "Role" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000001"), new Guid("00000000-0000-0000-0000-000000000003"), "admin" });

            migrationBuilder.InsertData(
                schema: "hockey",
                table: "Teams",
                columns: new[] { "Id", "AgeGroup", "Name", "OrganisationId" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000002"), "", "Local team", new Guid("00000000-0000-0000-0000-000000000001") });

            migrationBuilder.CreateIndex(
                name: "IX_Trainings_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Trainings",
                columns: new[] { "OrganisationId", "OriginTeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_Trainings_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Trainings",
                columns: new[] { "OrganisationId", "OwnerTeamId", "Visibility" });

            migrationBuilder.CreateIndex(
                name: "IX_Drills_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Drills",
                columns: new[] { "OrganisationId", "OriginTeamId" });

            migrationBuilder.CreateIndex(
                name: "IX_Drills_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Drills",
                columns: new[] { "OrganisationId", "OwnerTeamId", "Visibility" });

            migrationBuilder.CreateIndex(
                name: "IX_OrganisationMembers_UserId",
                schema: "hockey",
                table: "OrganisationMembers",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TeamMembers_UserId",
                schema: "hockey",
                table: "TeamMembers",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Drills_Organisations_OrganisationId",
                schema: "hockey",
                table: "Drills",
                column: "OrganisationId",
                principalSchema: "hockey",
                principalTable: "Organisations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Drills_Teams_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Drills",
                columns: new[] { "OrganisationId", "OriginTeamId" },
                principalSchema: "hockey",
                principalTable: "Teams",
                principalColumns: new[] { "OrganisationId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Drills_Teams_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Drills",
                columns: new[] { "OrganisationId", "OwnerTeamId" },
                principalSchema: "hockey",
                principalTable: "Teams",
                principalColumns: new[] { "OrganisationId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Trainings_Organisations_OrganisationId",
                schema: "hockey",
                table: "Trainings",
                column: "OrganisationId",
                principalSchema: "hockey",
                principalTable: "Organisations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Trainings_Teams_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Trainings",
                columns: new[] { "OrganisationId", "OriginTeamId" },
                principalSchema: "hockey",
                principalTable: "Teams",
                principalColumns: new[] { "OrganisationId", "Id" },
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Trainings_Teams_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Trainings",
                columns: new[] { "OrganisationId", "OwnerTeamId" },
                principalSchema: "hockey",
                principalTable: "Teams",
                principalColumns: new[] { "OrganisationId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Drills_Organisations_OrganisationId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropForeignKey(
                name: "FK_Drills_Teams_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropForeignKey(
                name: "FK_Drills_Teams_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropForeignKey(
                name: "FK_Trainings_Organisations_OrganisationId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropForeignKey(
                name: "FK_Trainings_Teams_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropForeignKey(
                name: "FK_Trainings_Teams_OrganisationId_OwnerTeamId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropTable(
                name: "OrganisationMembers",
                schema: "hockey");

            migrationBuilder.DropTable(
                name: "TeamMembers",
                schema: "hockey");

            migrationBuilder.DropTable(
                name: "Teams",
                schema: "hockey");

            migrationBuilder.DropTable(
                name: "Organisations",
                schema: "hockey");

            migrationBuilder.DropIndex(
                name: "IX_Trainings_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropIndex(
                name: "IX_Trainings_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropIndex(
                name: "IX_Drills_OrganisationId_OriginTeamId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropIndex(
                name: "IX_Drills_OrganisationId_OwnerTeamId_Visibility",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "AgeGroup",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "OrganisationId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "OriginTeamId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "OwnerTeamId",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "Visibility",
                schema: "hockey",
                table: "Trainings");

            migrationBuilder.DropColumn(
                name: "AgeGroup",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "OrganisationId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "OriginTeamId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "OwnerTeamId",
                schema: "hockey",
                table: "Drills");

            migrationBuilder.DropColumn(
                name: "Visibility",
                schema: "hockey",
                table: "Drills");
        }
    }
}
