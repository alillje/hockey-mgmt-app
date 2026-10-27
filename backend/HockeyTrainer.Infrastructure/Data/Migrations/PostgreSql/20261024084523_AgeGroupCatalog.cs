using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class AgeGroupCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AgeGroups",
                schema: "hockey",
                columns: table => new
                {
                    Id = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AgeGroups", x => x.Id);
                });

            migrationBuilder.InsertData(
                schema: "hockey",
                table: "AgeGroups",
                columns: new[] { "Id", "Name", "SortOrder" },
                values: new object[,]
                {
                    { "Senior", "Senior", 100 },
                    { "U10", "U10", 10 },
                    { "U11", "U11", 11 },
                    { "U12", "U12", 12 },
                    { "U13", "U13", 13 },
                    { "U14", "U14", 14 },
                    { "U15", "U15", 15 },
                    { "U16", "U16", 16 },
                    { "U18", "U18", 18 },
                    { "U19", "U19", 19 },
                    { "U20", "U20", 20 },
                    { "U8", "U8", 8 },
                    { "U9", "U9", 9 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AgeGroups",
                schema: "hockey");
        }
    }
}
