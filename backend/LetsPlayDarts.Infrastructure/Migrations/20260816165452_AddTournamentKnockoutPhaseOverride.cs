using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTournamentKnockoutPhaseOverride : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "KnockoutPhaseOverride",
                table: "Tournaments",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "KnockoutPhaseOverride",
                table: "Tournaments");
        }
    }
}
