using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

public static class GameEndpoints
{
    public static void MapGameEndpoints(this WebApplication app)
    {
        var games = app.MapGroup("/api/tournaments/{tournamentId:guid}/games").RequireAuthorization();

        // Anonymous - lets a paired Tablet start a game for its board
        // itself, not just the Regie (same project plan decision as
        // player registration above).
        games.MapPost("/", async (Guid tournamentId, CreateGameRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
            if (tournament is null)
                return Results.NotFound();

            var board = await db.Boards.FirstOrDefaultAsync(b => b.Id == request.BoardId);
            if (board is null)
                return Results.BadRequest("Board not found.");

            var settings = tournament.Status == TournamentStatus.FinalStarted
                ? tournament.FinalSettings
                : tournament.QualificationSettings;

            if (settings.Mode == GameMode.Highscore && settings.Rounds is null)
                return Results.BadRequest("The active phase's game settings do not define a round count.");

            if (settings.Mode == GameMode.X01 && settings.StartScore is null)
                return Results.BadRequest("The active phase's game settings do not define a start score.");

            var busyPlayerName = await FindPlayerAlreadyInProgressAsync(db, request.PlayerIds);
            if (busyPlayerName is not null)
                return Results.Conflict($"{busyPlayerName} spielt bereits an einem anderen Board.");

            try
            {
                var game = new Game(tournamentId, request.BoardId, settings.Mode, settings.Rounds, settings.StartScore, request.PlayerIds);
                db.Games.Add(game);
                await db.SaveChangesAsync();
                var dto = await ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.BoardGroupName(request.BoardId)).SendAsync("gameStarted", dto);
                return Results.Created($"/api/tournaments/{tournamentId}/games/{game.Id}", dto);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).AllowAnonymous();

        games.MapGet("/{id:guid}", async (Guid tournamentId, Guid id, DartsDbContext db) =>
            await db.Games.FirstOrDefaultAsync(g => g.Id == id)
                is { } game
                ? Results.Ok(await ToDtoAsync(game, db))
                : Results.NotFound());

        games.MapDelete("/{id:guid}", async (Guid tournamentId, Guid id, DartsDbContext db) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            db.Games.Remove(game);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        games.MapPut("/{id:guid}/board", async (Guid tournamentId, Guid id, ChangeGameBoardRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            try
            {
                game.ChangeBoard(request.BoardId);
                await db.SaveChangesAsync();
                var dto = await ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        games.MapPost("/{id:guid}/turns", async (Guid tournamentId, Guid id, RecordTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            try
            {
                game.RecordTurn(request.PlayerId, request.Score);
                await db.SaveChangesAsync();
                var dto = await ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);

                if (game.Status == GameStatus.Finished && game.KnockoutMatchId is { } matchId)
                    await ApplyKnockoutLegResultAsync(matchId, db, hub);

                if (game.Status == GameStatus.Finished && game.GroupRoundId is { } groupId)
                    await GroupEndpoints.ApplyGroupStandingsAsync(groupId, db, hub);

                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        games.MapPost("/{id:guid}/turns/undo", async (Guid tournamentId, Guid id, UndoTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            try
            {
                game.RemoveLastTurn(request.PlayerId);
                await db.SaveChangesAsync();
                var dto = await ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Second correction level: clears one player's throws entirely,
        // leaving everyone else untouched.
        games.MapPost("/{id:guid}/turns/undo-player", async (Guid tournamentId, Guid id, UndoTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            try
            {
                game.RemoveAllTurnsForPlayer(request.PlayerId);
                await db.SaveChangesAsync();
                var dto = await ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Third correction level: clears every player's throws, restarting
        // the game from scratch without recreating it.
        games.MapPost("/{id:guid}/turns/reset", async (Guid tournamentId, Guid id, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            game.ResetAllTurns();
            await db.SaveChangesAsync();
            var dto = await ToDtoAsync(game, db);
            await hub.Clients.Group(GameHub.GroupName(id)).SendAsync("gameUpdated", dto);
            await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
            return Results.Ok(dto);
        });

        games.MapGet("/{id:guid}/standings", async (Guid tournamentId, Guid id, DartsDbContext db) =>
        {
            var game = await db.Games.FirstOrDefaultAsync(g => g.Id == id);
            if (game is null)
                return Results.NotFound();

            return Results.Ok((await ToDtoAsync(game, db)).Entries);
        });

        // Anonymous - lets a paired board monitor find out which game (if
        // any) is currently being played on its board, without a login.
        app.MapGet("/api/boards/{boardId:guid}/current-game", async (Guid boardId, DartsDbContext db) =>
        {
            var game = await db.Games
                .Where(g => g.BoardId == boardId && g.Status == GameStatus.InProgress)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync()
                ?? await db.Games
                    .Where(g => g.BoardId == boardId)
                    .OrderByDescending(g => g.StartedAt)
                    .FirstOrDefaultAsync();

            return game is null ? Results.NotFound() : Results.Ok(await ToDtoAsync(game, db));
        });
    }

    /// <summary>
    /// After a leg (Game) linked to a knockout match finishes, recomputes
    /// the match's leg wins and applies a winner once one side reaches the
    /// required leg count (see KnockoutMatch.ApplyLegResults).
    /// </summary>
    internal static async Task ApplyKnockoutLegResultAsync(Guid matchId, DartsDbContext db, IHubContext<GameHub> hub)
    {
        var match = await db.KnockoutMatches.FirstOrDefaultAsync(m => m.Id == matchId);
        if (match is null || match.WinnerId is not null)
            return;

        var legs = await db.Games
            .Where(g => g.KnockoutMatchId == matchId && g.Status == GameStatus.Finished)
            .ToListAsync();

        var player1Wins = legs.Count(g => KnockoutEndpoints.WinnerOf(g) == match.Player1Id);
        var player2Wins = legs.Count(g => KnockoutEndpoints.WinnerOf(g) == match.Player2Id);
        match.ApplyLegResults(player1Wins, player2Wins);
        await db.SaveChangesAsync();

        var allMatches = await db.KnockoutMatches.Where(m => m.TournamentId == match.TournamentId).ToListAsync();
        var matchDtos = await KnockoutEndpoints.ToDtosAsync(allMatches, db);
        await hub.Clients.Group(GameHub.TournamentGroupName(match.TournamentId)).SendAsync("knockoutUpdated", matchDtos);
    }

    /// <summary>
    /// A real person can't stand at two boards at once - checks whether any
    /// of the given players already has an entry in a currently running
    /// game anywhere (not just this tournament: qualification, group round
    /// and knockout games all share this check). Returns the display name
    /// of the first conflicting player found, or null if none are busy.
    /// </summary>
    internal static async Task<string?> FindPlayerAlreadyInProgressAsync(DartsDbContext db, IEnumerable<Guid> playerIds)
    {
        var idSet = playerIds.ToHashSet();
        // Filtered in memory rather than via SelectMany/Contains over the
        // owned Entries collection - there are only ever a handful of
        // InProgress games at once, and this sidesteps any EF query
        // translation ambiguity over an owned sub-collection.
        var inProgressGames = await db.Games.Where(g => g.Status == GameStatus.InProgress).ToListAsync();
        var busyPlayerId = inProgressGames
            .SelectMany(g => g.Entries)
            .Select(e => (Guid?)e.PlayerId)
            .FirstOrDefault(id => idSet.Contains(id!.Value));

        if (busyPlayerId is null)
            return null;

        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == busyPlayerId);
        return player?.DisplayName ?? busyPlayerId.ToString();
    }

    internal static async Task<GameDto> ToDtoAsync(Game game, DartsDbContext db)
    {
        var playerIds = game.Entries.Select(e => e.PlayerId).ToList();
        var names = await db.Players
            .Where(p => playerIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.DisplayName);

        return new GameDto(
            game.Id,
            game.TournamentId,
            game.BoardId,
            game.Mode,
            game.Rounds,
            game.StartScore,
            game.Status,
            game.CurrentTurnPlayerId,
            game.Entries
                .OrderBy(e => e.TurnOrder)
                .Select(e => new GameEntryDto(
                    e.PlayerId,
                    names.GetValueOrDefault(e.PlayerId, "?"),
                    e.RoundScores,
                    e.Total,
                    game.StartScore is { } startScore ? startScore - e.Total : null)),
            game.KnockoutMatchId,
            game.IsTied,
            game.TiebreakWinnerId);
    }
}

public record CreateGameRequest(Guid BoardId, List<Guid> PlayerIds);

public record RecordTurnRequest(Guid PlayerId, int Score);

public record ChangeGameBoardRequest(Guid BoardId);

public record UndoTurnRequest(Guid PlayerId);

public record ResolveGameTieRequest(Guid WinnerId);

public record GameEntryDto(Guid PlayerId, string PlayerName, IReadOnlyList<int> RoundScores, int Total, int? Remaining);

public record GameDto(
    Guid Id,
    Guid TournamentId,
    Guid BoardId,
    GameMode Mode,
    int? Rounds,
    int? StartScore,
    GameStatus Status,
    Guid? CurrentTurnPlayerId,
    IEnumerable<GameEntryDto> Entries,
    Guid? KnockoutMatchId,
    bool IsTied,
    Guid? TiebreakWinnerId);
