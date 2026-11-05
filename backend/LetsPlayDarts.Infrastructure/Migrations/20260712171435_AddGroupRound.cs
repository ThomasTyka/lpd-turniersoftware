using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupRound : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "GroupRoundId",
                table: "Games",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GroupRounds",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    TournamentId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Round = table.Column<int>(type: "INTEGER", nullable: false),
                    Position = table.Column<int>(type: "INTEGER", nullable: false),
                    AdvanceCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ParticipantIds = table.Column<string>(type: "TEXT", nullable: false),
                    AdvancingPlayerIds = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupRounds", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Games_GroupRoundId",
                table: "Games",
                column: "GroupRoundId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupRounds_TournamentId_Round",
                table: "GroupRounds",
                columns: new[] { "TournamentId", "Round" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupRounds");

            migrationBuilder.DropIndex(
                name: "IX_Games_GroupRoundId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "GroupRoundId",
                table: "Games");
        }
    }
}
