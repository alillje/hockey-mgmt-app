using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql;

/// <inheritdoc />
public partial class RemoveU19AgeGroup : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DeleteData(
            schema: "hockey",
            table: "AgeGroups",
            keyColumn: "Id",
            keyValue: "U19");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.InsertData(
            schema: "hockey",
            table: "AgeGroups",
            columns: new[] { "Id", "Name", "SortOrder" },
            values: new object[] { "U19", "U19", 19 });
    }
}
