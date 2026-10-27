using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class InitialPostgreSql : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "hockey");

            migrationBuilder.CreateTable(
                name: "Drills",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    CategoryId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Notes = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: false),
                    TagsJson = table.Column<string>(type: "text", nullable: false, defaultValue: "[]"),
                    DiagramJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Drills", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Trainings",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Notes = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: false),
                    TagsJson = table.Column<string>(type: "text", nullable: false, defaultValue: "[]"),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Trainings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "TrainingEntries",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TrainingId = table.Column<Guid>(type: "uuid", nullable: false),
                    DrillId = table.Column<Guid>(type: "uuid", nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    Notes = table.Column<string>(type: "character varying(6000)", maxLength: 6000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TrainingEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TrainingEntries_Drills_DrillId",
                        column: x => x.DrillId,
                        principalSchema: "hockey",
                        principalTable: "Drills",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TrainingEntries_Trainings_TrainingId",
                        column: x => x.TrainingId,
                        principalSchema: "hockey",
                        principalTable: "Trainings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEntries_DrillId",
                schema: "hockey",
                table: "TrainingEntries",
                column: "DrillId");

            migrationBuilder.CreateIndex(
                name: "IX_TrainingEntries_TrainingId_Position",
                schema: "hockey",
                table: "TrainingEntries",
                columns: new[] { "TrainingId", "Position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TrainingEntries",
                schema: "hockey");

            migrationBuilder.DropTable(
                name: "Drills",
                schema: "hockey");

            migrationBuilder.DropTable(
                name: "Trainings",
                schema: "hockey");
        }
    }
}
