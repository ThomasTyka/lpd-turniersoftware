using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// Gruppen-Runden: an alternative round type to the 1v1 KO-bracket, matching
/// how the old Tournament-Manager's "numberOfWinners per game" rounds
/// worked. Participants are striped across a fixed number of groups by rank
/// (seed 1,5,9,13 -> group 1 for 16 players / 4 groups, etc.), each group
/// plays one shared Highscore game, and the top AdvanceCount by score
/// advance - automatically, unless there's a tie at the cutoff, in which
/// case the Regie resolves it manually (see GroupRound.ResolveTie). The
/// advancing pool then feeds either another group round or the existing
/// KO-bracket (via KnockoutEndpoints' SeededPlayerIds).
/// </summary>
public static class GroupEndpoints
{
    public static void MapGroupEndpoints(this WebApplication app)
    {
        var groups = app.MapGroup("/api/events/{eventId:guid}/tournaments/{tournamentId:guid}/groups").RequireAuthorization();

        groups.MapGet("/", async (Guid eventId, Guid tournamentId, DartsDbContext db) =>
        {
            var allGroups = await db.GroupRounds.Where(g => g.TournamentId == tournamentId).ToListAsync();
            return Results.Ok(await ToDtosAsync(allGroups, db));
        });

        groups.MapPost("/round", async (Guid eventId, Guid tournamentId, StartGroupRoundRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
            if (tournament is null)
                return Results.NotFound();

            if (tournament.Status != TournamentStatus.FinalStarted)
                return Results.BadRequest("Start the final phase before starting a group round.");

            if (request.GroupCount < 1)
                return Results.BadRequest("At least 1 group is required.");

            if (request.ParticipantCount < 2 || request.ParticipantCount % request.GroupCount != 0)
                return Results.BadRequest("ParticipantCount must be positive and divide evenly across GroupCount groups.");

            var participantsPerGroup = request.ParticipantCount / request.GroupCount;
            if (request.AdvanceCount < 1 || request.AdvanceCount >= participantsPerGroup)
                return Results.BadRequest("AdvanceCount must be positive and less than the number of participants per group.");

            var existingGroups = await db.GroupRounds.Where(g => g.TournamentId == tournamentId).ToListAsync();

            List<Guid> pool;
            int nextRoundNumber;
            if (existingGroups.Count == 0)
            {
                nextRoundNumber = 1;
                var leaderboard = await TournamentEndpoints.GetLeaderboardEntriesAsync(tournamentId, request.QualificationBestOf, db);
                if (leaderboard.Count < request.ParticipantCount)
                    return Results.BadRequest($"Only {leaderboard.Count} players have finished qualification games; cannot fill {request.ParticipantCount} group slots.");
                pool = leaderboard.Take(request.ParticipantCount).Select(e => e.PlayerId).ToList();
            }
            else
            {
                var currentRound = existingGroups.Max(g => g.Round);
                var currentGroups = existingGroups.Where(g => g.Round == currentRound).ToList();
                if (currentGroups.Any(g => !g.IsDecided))
                    return Results.BadRequest($"Group round {currentRound} is not finished yet.");

                nextRoundNumber = currentRound + 1;
                pool = currentGroups.OrderBy(g => g.Position).SelectMany(g => g.AdvancingPlayerIds).ToList();
                if (pool.Count != request.ParticipantCount)
                    return Results.BadRequest($"Round {currentRound} produced {pool.Count} advancing players; ParticipantCount must match.");
            }

            var newGroups = new List<GroupRound>();
            for (var g = 0; g < request.GroupCount; g++)
            {
                var participantIds = new List<Guid>();
                for (var j = 0; j < participantsPerGroup; j++)
                    participantIds.Add(pool[g + j * request.GroupCount]);

                newGroups.Add(new GroupRound(tournamentId, nextRoundNumber, g, request.AdvanceCount, participantIds));
            }

            db.GroupRounds.AddRange(newGroups);
            await db.SaveChangesAsync();

            var allDtos = await ToDtosAsync(newGroups, db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("groupsUpdated", allDtos);
            return Results.Ok(allDtos);
        });

        groups.MapPost("/{groupId:guid}/games", async (Guid eventId, Guid tournamentId, Guid groupId, CreateGroupGameRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var group = await db.GroupRounds.FirstOrDefaultAsync(g => g.Id == groupId && g.TournamentId == tournamentId);
            if (group is null)
                return Results.NotFound();

            if (group.IsDecided)
                return Results.BadRequest("This group has already been decided.");

            var hasGame = await db.Games.AnyAsync(g => g.GroupRoundId == groupId);
            if (hasGame)
                return Results.BadRequest("A game for this group already exists.");

            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
            if (tournament is null)
                return Results.NotFound();

            var board = await db.Boards.FirstOrDefaultAsync(b => b.Id == request.BoardId);
            if (board is null)
                return Results.BadRequest("Board not found.");

            var settings = tournament.FinalSettings;
            if (settings.Mode != GameMode.Highscore)
                return Results.BadRequest("Only Highscore games are supported right now.");

            if (settings.Rounds is not { } rounds)
                return Results.BadRequest("The final phase's game settings do not define a round count.");

            var busyPlayerName = await GameEndpoints.FindPlayerAlreadyInProgressAsync(db, group.ParticipantIds);
            if (busyPlayerName is not null)
                return Results.Conflict($"{busyPlayerName} spielt bereits an einem anderen Board.");

            var game = new Game(tournamentId, request.BoardId, GameMode.Highscore, rounds, null, group.ParticipantIds, groupRoundId: group.Id);
            db.Games.Add(game);
            await db.SaveChangesAsync();

            var dto = await GameEndpoints.ToDtoAsync(game, db);
            await hub.Clients.Group(GameHub.BoardGroupName(request.BoardId)).SendAsync("gameStarted", dto);
            return Results.Created($"/api/tournaments/{tournamentId}/games/{game.Id}", dto);
        });

        // Players eligible as a substitute ("Nachrückspieler") for a group
        // participant who's missing - see GetEligibleSubstituteIdsAsync.
        // Manual only, by design: nothing here ever picks or applies a
        // substitute on its own.
        groups.MapGet("/available-substitutes", async (Guid eventId, Guid tournamentId, DartsDbContext db) =>
        {
            var eligibleIds = await GetEligibleSubstituteIdsAsync(tournamentId, db);
            var names = await db.Players.Where(p => eligibleIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName);
            var dtos = eligibleIds
                .Select(id => new AvailableSubstituteDto(id, names.GetValueOrDefault(id, "?")))
                .OrderBy(d => d.PlayerName)
                .ToList();
            return Results.Ok(dtos);
        });

        groups.MapPost("/{groupId:guid}/substitute", async (Guid eventId, Guid tournamentId, Guid groupId, SubstituteGroupParticipantRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var group = await db.GroupRounds.FirstOrDefaultAsync(g => g.Id == groupId && g.TournamentId == tournamentId);
            if (group is null)
                return Results.NotFound();

            var hasGame = await db.Games.AnyAsync(g => g.GroupRoundId == groupId);
            if (hasGame)
                return Results.BadRequest("Cannot substitute once this group's game has started.");

            var eligibleIds = await GetEligibleSubstituteIdsAsync(tournamentId, db);
            if (!eligibleIds.Contains(request.IncomingPlayerId))
                return Results.BadRequest("The incoming player is not an eligible substitute in this tournament.");

            try
            {
                group.SubstituteParticipant(request.OutgoingPlayerId, request.IncomingPlayerId);
                await db.SaveChangesAsync();
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }

            var allDtos = await ToDtosAsync(await db.GroupRounds.Where(g => g.TournamentId == tournamentId).ToListAsync(), db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("groupsUpdated", allDtos);
            return Results.Ok(allDtos.First(d => d.Id == groupId));
        });

        groups.MapPost("/{groupId:guid}/resolve-tie", async (Guid eventId, Guid tournamentId, Guid groupId, ResolveTieRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var group = await db.GroupRounds.FirstOrDefaultAsync(g => g.Id == groupId && g.TournamentId == tournamentId);
            if (group is null)
                return Results.NotFound();

            var game = await db.Games.FirstOrDefaultAsync(g => g.GroupRoundId == groupId);
            if (game is null || game.Status != GameStatus.Finished)
                return Results.BadRequest("This group's game has not finished yet.");

            var standings = game.Entries.OrderByDescending(e => e.Total).Select(e => (e.PlayerId, e.Total)).ToList();

            try
            {
                group.ResolveTie(request.AdvancingPlayerIds, standings);
                await db.SaveChangesAsync();
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }

            var allDtos = await ToDtosAsync(await db.GroupRounds.Where(g => g.TournamentId == tournamentId).ToListAsync(), db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("groupsUpdated", allDtos);
            return Results.Ok(allDtos.First(d => d.Id == groupId));
        });
    }

    /// <summary>
    /// After a group's shared game finishes, tries to auto-decide
    /// advancement from the final standings (see GroupRound.TryApplyStandings).
    /// A no-op if there's a tie at the cutoff - the Regie must then call
    /// resolve-tie. Called from GameEndpoints when a group game finishes.
    /// </summary>
    internal static async Task ApplyGroupStandingsAsync(Guid groupId, DartsDbContext db, IHubContext<GameHub> hub)
    {
        var group = await db.GroupRounds.FirstOrDefaultAsync(g => g.Id == groupId);
        if (group is null || group.IsDecided)
            return;

        var game = await db.Games.FirstOrDefaultAsync(g => g.GroupRoundId == groupId);
        if (game is null)
            return;

        var standings = game.Entries.OrderByDescending(e => e.Total).Select(e => (e.PlayerId, e.Total)).ToList();
        group.TryApplyStandings(standings);
        await db.SaveChangesAsync();

        var allGroups = await db.GroupRounds.Where(g => g.TournamentId == group.TournamentId).ToListAsync();
        var groupDtos = await ToDtosAsync(allGroups, db);
        await hub.Clients.Group(GameHub.TournamentGroupName(group.TournamentId)).SendAsync("groupsUpdated", groupDtos);
    }

    /// <summary>
    /// Players eligible to be substituted into the current group round right
    /// now: qualified players (from the qualification leaderboard) who
    /// aren't a participant of any group in the current round - either
    /// because they were never picked for a group at all (ranked below the
    /// cut, or a no-show with nobody eliminated yet to draw from) or because
    /// they were eliminated in an earlier group round.
    /// </summary>
    private static async Task<List<Guid>> GetEligibleSubstituteIdsAsync(Guid tournamentId, DartsDbContext db)
    {
        var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
        var allGroups = await db.GroupRounds.Where(g => g.TournamentId == tournamentId).ToListAsync();

        var currentRoundParticipantIds = allGroups.Count == 0
            ? new HashSet<Guid>()
            : allGroups
                .Where(g => g.Round == allGroups.Max(x => x.Round))
                .SelectMany(g => g.ParticipantIds)
                .ToHashSet();

        var everParticipatedIds = allGroups.SelectMany(g => g.ParticipantIds);

        var leaderboard = await TournamentEndpoints.GetLeaderboardEntriesAsync(tournamentId, tournament?.QualificationBestOf, db);
        var qualifiedIds = leaderboard.Select(e => e.PlayerId);

        return qualifiedIds
            .Concat(everParticipatedIds)
            .Distinct()
            .Where(id => !currentRoundParticipantIds.Contains(id))
            .ToList();
    }

    internal static async Task<List<GroupRoundDto>> ToDtosAsync(List<GroupRound> groupsList, DartsDbContext db)
    {
        var groupIds = groupsList.Select(g => g.Id).ToList();
        var games = await db.Games.Where(g => g.GroupRoundId != null && groupIds.Contains(g.GroupRoundId!.Value)).ToListAsync();

        var playerIds = groupsList.SelectMany(g => g.ParticipantIds).Distinct().ToList();
        var names = await db.Players.Where(p => playerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName);

        return groupsList
            .OrderBy(g => g.Round).ThenBy(g => g.Position)
            .Select(g =>
            {
                var game = games.FirstOrDefault(x => x.GroupRoundId == g.Id);
                var totals = game?.Entries.ToDictionary(e => e.PlayerId, e => e.Total) ?? new Dictionary<Guid, int>();
                var needsTieBreak = !g.IsDecided && game?.Status == GameStatus.Finished;

                var participants = g.ParticipantIds
                    .Select(pid => new GroupParticipantDto(
                        pid,
                        names.GetValueOrDefault(pid, "?"),
                        totals.GetValueOrDefault(pid, 0),
                        g.AdvancingPlayerIds.Contains(pid)))
                    .OrderByDescending(p => p.Total)
                    .ToList();

                return new GroupRoundDto(g.Id, g.Round, g.Position, g.AdvanceCount, g.IsDecided, needsTieBreak, game?.Id, game?.Status, participants);
            })
            .ToList();
    }
}

public record StartGroupRoundRequest(int ParticipantCount, int GroupCount, int AdvanceCount, int? QualificationBestOf);

public record CreateGroupGameRequest(Guid BoardId);

public record ResolveTieRequest(List<Guid> AdvancingPlayerIds);

public record SubstituteGroupParticipantRequest(Guid OutgoingPlayerId, Guid IncomingPlayerId);

public record GroupParticipantDto(Guid PlayerId, string PlayerName, int Total, bool IsAdvancing);

public record GroupRoundDto(
    Guid Id, int Round, int Position, int AdvanceCount, bool IsDecided, bool NeedsTieBreak,
    Guid? GameId, GameStatus? GameStatus,
    List<GroupParticipantDto> Participants);
