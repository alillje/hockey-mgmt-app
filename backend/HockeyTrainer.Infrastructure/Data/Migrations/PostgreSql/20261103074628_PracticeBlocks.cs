using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class PracticeBlocks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "RunInParallelWithPrevious",
                schema: "hockey",
                table: "TrainingEntries",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RunInParallelWithPrevious",
                schema: "hockey",
                table: "TrainingEntries");
        }
    }
}
