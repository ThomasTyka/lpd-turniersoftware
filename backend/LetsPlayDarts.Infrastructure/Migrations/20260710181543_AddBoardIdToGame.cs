using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardIdToGame : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BoardId",
                table: "Games",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTime>(
                name: "StartedAt",
                table: "Games",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BoardId",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "StartedAt",
                table: "Games");
        }
    }
}
