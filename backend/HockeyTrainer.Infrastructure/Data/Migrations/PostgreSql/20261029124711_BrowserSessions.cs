using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HockeyTrainer.Infrastructure.Data.Migrations.PostgreSql
{
    /// <inheritdoc />
    public partial class BrowserSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BrowserSessions",
                schema: "hockey",
                columns: table => new
                {
                    IdHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    ProtectedTokens = table.Column<string>(type: "text", nullable: false),
                    AccessExpiresAt = table.Column<long>(type: "bigint", nullable: false),
                    AbsoluteExpiresAt = table.Column<long>(type: "bigint", nullable: false),
                    IdleExpiresAt = table.Column<long>(type: "bigint", nullable: false),
                    RefreshLeaseUntil = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BrowserSessions", x => x.IdHash);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BrowserSessions_AbsoluteExpiresAt",
                schema: "hockey",
                table: "BrowserSessions",
                column: "AbsoluteExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_BrowserSessions_IdleExpiresAt",
                schema: "hockey",
                table: "BrowserSessions",
                column: "IdleExpiresAt");
            migrationBuilder.Sql("""
                ALTER TABLE hockey."BrowserSessions" ENABLE ROW LEVEL SECURITY;
                REVOKE ALL ON TABLE hockey."BrowserSessions" FROM PUBLIC;
                DO $session_privileges$
                BEGIN
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
                        REVOKE ALL ON TABLE hockey."BrowserSessions" FROM anon;
                    END IF;
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
                        REVOKE ALL ON TABLE hockey."BrowserSessions" FROM authenticated;
                    END IF;
                END $session_privileges$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BrowserSessions",
                schema: "hockey");
        }
    }
}
