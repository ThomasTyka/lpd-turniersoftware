using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGameX01Support : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Rounds",
                table: "Games",
                type: "INTEGER",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "INTEGER");

            migrationBuilder.AddColumn<int>(
                name: "Mode",
                table: "Games",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "StartScore",
                table: "Games",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Mode",
                table: "Games");

            migrationBuilder.DropColumn(
                name: "StartScore",
                table: "Games");

            migrationBuilder.AlterColumn<int>(
                name: "Rounds",
                table: "Games",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "INTEGER",
                oldNullable: true);
        }
    }
}
