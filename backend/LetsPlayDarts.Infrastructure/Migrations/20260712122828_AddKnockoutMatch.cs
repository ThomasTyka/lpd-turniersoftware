using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddKnockoutMatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "KnockoutMatchId",
                table: "Games",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "KnockoutMatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TournamentId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Round = table.Column<int>(type: "INTEGER", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false),
                    BestOfLegs = table.Column<int>(type: "INTEGER", nullable: false),
                    Player1Id = table.Column<Guid>(type: "TEXT", nullable: true),
                    Player2Id = table.Column<Guid>(type: "TEXT", nullable: true),
                    WinnerId = table.Column<Guid>(type: "TEXT", nullable: true),
                    IsThirdPlaceMatch = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KnockoutMatches", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Games_KnockoutMatchId",
                table: "Games",
                column: "KnockoutMatchId");

            migrationBuilder.CreateIndex(
                name: "IX_KnockoutMatches_TournamentId_Round",
                table: "KnockoutMatches",
                columns: new[] { "TournamentId", "Round" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "KnockoutMatches");

            migrationBuilder.DropIndex(
                name: "IX_Games_KnockoutMatchId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "KnockoutMatchId",
                table: "Games");
        }
    }
}
