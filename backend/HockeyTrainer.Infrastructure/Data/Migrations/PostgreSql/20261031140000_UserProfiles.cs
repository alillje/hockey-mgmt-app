using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class UserProfiles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "UserProfiles",
                schema: "hockey",
                columns: table => new
                {
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserProfiles", x => x.UserId);
                });
            migrationBuilder.Sql("""
                ALTER TABLE hockey."UserProfiles" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE hockey."UserProfiles" FROM PUBLIC;
                DO $profile_privileges$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON TABLE hockey."UserProfiles" FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE ALL ON TABLE hockey."UserProfiles" FROM authenticated;
                    END IF;
                END $profile_privileges$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserProfiles",
                schema: "hockey");
        }
    }
}
