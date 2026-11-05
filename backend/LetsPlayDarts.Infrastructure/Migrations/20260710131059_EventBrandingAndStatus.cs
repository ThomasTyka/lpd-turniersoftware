using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LetsPlayDarts.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EventBrandingAndStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FinalSettings_Rounds",
                table: "Tournaments",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QualificationSettings_Rounds",
                table: "Tournaments",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LogoPath",
                table: "Events",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PlannedBoardCount",
                table: "Events",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrimaryColor",
                table: "Events",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SecondaryColor",
                table: "Events",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "Events",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FinalSettings_Rounds",
                table: "Tournaments");

            migrationBuilder.DropColumn(
                name: "QualificationSettings_Rounds",
                table: "Tournaments");

            migrationBuilder.DropColumn(
                name: "LogoPath",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "PlannedBoardCount",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "PrimaryColor",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "SecondaryColor",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Events");
        }
    }
}
