using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// Teams: a named group of an event's players, matching the old
/// Tournament-Manager's Team model (project plan Abschnitt 2/3.1: "Highscore
/// ... und 501, jeweils als Einzel- oder Team-Variante"). Members still
/// throw individually - a team's score for a game is the sum of its
/// members' totals in that game (see TournamentEndpoints' team-leaderboard).
/// </summary>
public static class TeamEndpoints
{
    public static void MapTeamEndpoints(this WebApplication app)
    {
        var teams = app.MapGroup("/api/events/{eventId:guid}/teams").RequireAuthorization();

        teams.MapGet("/", async (Guid eventId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Teams).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            return Results.Ok(await ToDtosAsync(eventEntity.Teams.ToList(), db));
        });

        teams.MapPost("/", async (Guid eventId, CreateTeamRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Teams).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                var team = new Team(request.Name, request.PlayerIds);
                eventEntity.AddTeam(team);
                await db.SaveChangesAsync();
                return Results.Created($"/api/events/{eventId}/teams/{team.Id}", (await ToDtosAsync([team], db))[0]);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        teams.MapPut("/{teamId:guid}", async (Guid eventId, Guid teamId, RenameTeamRequest request, DartsDbContext db) =>
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == teamId);
            if (team is null)
                return Results.NotFound();

            try
            {
                team.Rename(request.Name);
                await db.SaveChangesAsync();
                return Results.Ok((await ToDtosAsync([team], db))[0]);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        teams.MapPost("/{teamId:guid}/players", async (Guid eventId, Guid teamId, AddTeamPlayerRequest request, DartsDbContext db) =>
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == teamId);
            if (team is null)
                return Results.NotFound();

            try
            {
                team.AddPlayer(request.PlayerId);
                await db.SaveChangesAsync();
                return Results.Ok((await ToDtosAsync([team], db))[0]);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        teams.MapDelete("/{teamId:guid}/players/{playerId:guid}", async (Guid eventId, Guid teamId, Guid playerId, DartsDbContext db) =>
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == teamId);
            if (team is null)
                return Results.NotFound();

            try
            {
                team.RemovePlayer(playerId);
                await db.SaveChangesAsync();
                return Results.Ok((await ToDtosAsync([team], db))[0]);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        teams.MapDelete("/{teamId:guid}", async (Guid eventId, Guid teamId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Teams).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            var team = eventEntity.Teams.FirstOrDefault(t => t.Id == teamId);
            if (team is null)
                return Results.NotFound();

            eventEntity.RemoveTeam(team);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    internal static async Task<List<TeamDto>> ToDtosAsync(List<Team> teamsList, DartsDbContext db)
    {
        var playerIds = teamsList.SelectMany(t => t.PlayerIds).Distinct().ToList();
        var names = await db.Players.Where(p => playerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName);

        return teamsList
            .Select(t => new TeamDto(
                t.Id,
                t.Name,
                t.PlayerIds.Select(id => new TeamPlayerDto(id, names.GetValueOrDefault(id, "?"))).ToList()))
            .ToList();
    }
}

public record CreateTeamRequest(string Name, List<Guid> PlayerIds);

public record RenameTeamRequest(string Name);

public record AddTeamPlayerRequest(Guid PlayerId);

public record TeamPlayerDto(Guid PlayerId, string PlayerName);

public record TeamDto(Guid Id, string Name, List<TeamPlayerDto> Players);
