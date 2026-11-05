using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// KO-Runden: single-elimination bracket seeded from the qualification
/// leaderboard, with automatic pairing (Setzliste), best-of-N-legs matches,
/// and a "Spiel um Platz 3" between the semifinal losers (project plan
/// Abschnitt 2). A leg is an ordinary Game (see GameEndpoints), tagged with
/// KnockoutMatchId; the match itself is decided once one player has won a
/// majority of legs (see KnockoutMatch.ApplyLegResults, applied from
/// GameEndpoints when a leg finishes).
/// </summary>
public static class KnockoutEndpoints
{
    public static void MapKnockoutEndpoints(this WebApplication app)
    {
        var knockout = app.MapGroup("/api/events/{eventId:guid}/tournaments/{tournamentId:guid}/knockout").RequireAuthorization();

        knockout.MapGet("/", async (Guid eventId, Guid tournamentId, DartsDbContext db) =>
        {
            var matches = await db.KnockoutMatches.Where(m => m.TournamentId == tournamentId).ToListAsync();
            return Results.Ok(await ToDtosAsync(matches, db));
        });

        knockout.MapPost("/start", async (Guid eventId, Guid tournamentId, StartKnockoutRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
            if (tournament is null)
                return Results.NotFound();

            // No status guard here - the old system let you create games for
            // any phase at any time, with zero server-side validation
            // (actions/games.ts's createGame never checked event.status).

            if (await db.KnockoutMatches.AnyAsync(m => m.TournamentId == tournamentId))
                return Results.BadRequest("The knockout stage has already been started.");

            if (request.ParticipantCount < 2)
                return Results.BadRequest("At least 2 participants are required.");

            if (request.BestOfLegs <= 0 || request.BestOfLegs % 2 == 0)
                return Results.BadRequest("BestOfLegs must be a positive odd number.");

            List<Guid> qualifiedPlayerIds;
            if (request.SeededPlayerIds is { Count: > 0 } seeded)
            {
                if (seeded.Count != request.ParticipantCount)
                    return Results.BadRequest("SeededPlayerIds must contain exactly ParticipantCount players.");
                if (seeded.Distinct().Count() != seeded.Count)
                    return Results.BadRequest("SeededPlayerIds cannot contain duplicates.");
                qualifiedPlayerIds = seeded;
            }
            else
            {
                var leaderboard = await TournamentEndpoints.GetLeaderboardEntriesAsync(tournamentId, request.QualificationBestOf, db);
                if (leaderboard.Count < request.ParticipantCount)
                    return Results.BadRequest($"Only {leaderboard.Count} players have finished qualification games; cannot fill {request.ParticipantCount} bracket slots.");
                qualifiedPlayerIds = leaderboard.Take(request.ParticipantCount).Select(e => e.PlayerId).ToList();
            }

            var bracketSize = 1;
            while (bracketSize < request.ParticipantCount) bracketSize *= 2;

            var seedOrder = BuildSeedOrder(bracketSize);

            var matches = new List<KnockoutMatch>();
            for (var i = 0; i < bracketSize / 2; i++)
            {
                var seedA = seedOrder[i * 2];
                var seedB = seedOrder[i * 2 + 1];
                Guid? playerA = seedA <= qualifiedPlayerIds.Count ? qualifiedPlayerIds[seedA - 1] : null;
                Guid? playerB = seedB <= qualifiedPlayerIds.Count ? qualifiedPlayerIds[seedB - 1] : null;

                matches.Add(new KnockoutMatch(tournamentId, round: 1, position: i, request.BestOfLegs, playerA, playerB));
            }

            db.KnockoutMatches.AddRange(matches);
            await db.SaveChangesAsync();

            var allDtos = await ToDtosAsync(matches, db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("knockoutUpdated", allDtos);
            return Results.Ok(allDtos);
        });

        knockout.MapPost("/next-round", async (Guid eventId, Guid tournamentId, NextRoundRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var allMatches = await db.KnockoutMatches.Where(m => m.TournamentId == tournamentId).ToListAsync();
            if (allMatches.Count == 0)
                return Results.BadRequest("Start the knockout stage first.");

            var bracketMatches = allMatches.Where(m => !m.IsThirdPlaceMatch).ToList();
            var currentRound = bracketMatches.Max(m => m.Round);
            var currentMatches = bracketMatches.Where(m => m.Round == currentRound).OrderBy(m => m.Position).ToList();

            if (currentMatches.Any(m => m.WinnerId is null))
                return Results.BadRequest($"Round {currentRound} is not finished yet.");

            if (currentMatches.Count == 1)
                return Results.BadRequest("The knockout stage is already complete.");

            var bestOfLegs = request.BestOfLegs ?? currentMatches[0].BestOfLegs;
            var nextRound = currentRound + 1;
            var newMatches = new List<KnockoutMatch>();

            if (currentMatches.Count == 2)
            {
                newMatches.Add(new KnockoutMatch(tournamentId, nextRound, position: 0, bestOfLegs,
                    currentMatches[0].WinnerId, currentMatches[1].WinnerId));
                newMatches.Add(new KnockoutMatch(tournamentId, nextRound, position: 1, bestOfLegs,
                    Loser(currentMatches[0]), Loser(currentMatches[1]), isThirdPlaceMatch: true));
            }
            else
            {
                for (var i = 0; i < currentMatches.Count; i += 2)
                {
                    newMatches.Add(new KnockoutMatch(tournamentId, nextRound, position: i / 2, bestOfLegs,
                        currentMatches[i].WinnerId, currentMatches[i + 1].WinnerId));
                }
            }

            db.KnockoutMatches.AddRange(newMatches);
            await db.SaveChangesAsync();

            var allDtos = await ToDtosAsync(await db.KnockoutMatches.Where(m => m.TournamentId == tournamentId).ToListAsync(), db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("knockoutUpdated", allDtos);
            return Results.Ok(await ToDtosAsync(newMatches, db));
        });

        knockout.MapPost("/{matchId:guid}/games", async (Guid eventId, Guid tournamentId, Guid matchId, CreateKnockoutGameRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var match = await db.KnockoutMatches.FirstOrDefaultAsync(m => m.Id == matchId && m.TournamentId == tournamentId);
            if (match is null)
                return Results.NotFound();

            if (match.WinnerId is not null)
                return Results.BadRequest("This match has already been decided.");

            if (match.Player1Id is null || match.Player2Id is null)
                return Results.BadRequest("This match does not have two players yet.");

            var legInProgress = await db.Games.AnyAsync(g => g.KnockoutMatchId == matchId && g.Status == GameStatus.InProgress);
            if (legInProgress)
                return Results.BadRequest("A leg for this match is already in progress.");

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

            var busyPlayerName = await GameEndpoints.FindPlayerAlreadyInProgressAsync(db, [match.Player1Id.Value, match.Player2Id.Value]);
            if (busyPlayerName is not null)
                return Results.Conflict($"{busyPlayerName} spielt bereits an einem anderen Board.");

            var game = new Game(tournamentId, request.BoardId, GameMode.Highscore, rounds, null, [match.Player1Id.Value, match.Player2Id.Value], match.Id);
            db.Games.Add(game);
            await db.SaveChangesAsync();

            var dto = await GameEndpoints.ToDtoAsync(game, db);
            await hub.Clients.Group(GameHub.BoardGroupName(request.BoardId)).SendAsync("gameStarted", dto);
            return Results.Created($"/api/tournaments/{tournamentId}/games/{game.Id}", dto);
        });

        // Players eligible as a substitute ("Nachrückspieler") for someone who
        // can no longer continue - see GetEligibleSubstituteIdsAsync. Manual
        // only, by design: nothing here ever picks or applies a substitute
        // on its own.
        knockout.MapGet("/available-substitutes", async (Guid eventId, Guid tournamentId, DartsDbContext db) =>
        {
            var eligibleIds = await GetEligibleSubstituteIdsAsync(tournamentId, db);
            var names = await db.Players.Where(p => eligibleIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName);
            var dtos = eligibleIds
                .Select(id => new AvailableSubstituteDto(id, names.GetValueOrDefault(id, "?")))
                .OrderBy(d => d.PlayerName)
                .ToList();
            return Results.Ok(dtos);
        });

        knockout.MapPost("/{matchId:guid}/substitute", async (Guid eventId, Guid tournamentId, Guid matchId, SubstitutePlayerRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var match = await db.KnockoutMatches.FirstOrDefaultAsync(m => m.Id == matchId && m.TournamentId == tournamentId);
            if (match is null)
                return Results.NotFound();

            var hasLegs = await db.Games.AnyAsync(g => g.KnockoutMatchId == matchId);
            if (hasLegs)
                return Results.BadRequest("Cannot substitute once a leg has been played for this match.");

            var eligibleIds = await GetEligibleSubstituteIdsAsync(tournamentId, db);
            if (!eligibleIds.Contains(request.IncomingPlayerId))
                return Results.BadRequest("The incoming player is not an eligible substitute in this tournament.");

            try
            {
                match.SubstitutePlayer(request.OutgoingPlayerId, request.IncomingPlayerId);
                await db.SaveChangesAsync();
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }

            var allDtos = await ToDtosAsync(await db.KnockoutMatches.Where(m => m.TournamentId == tournamentId).ToListAsync(), db);
            await hub.Clients.Group(GameHub.TournamentGroupName(tournamentId)).SendAsync("knockoutUpdated", allDtos);
            return Results.Ok((await ToDtosAsync([match], db))[0]);
        });

        // Anonymous - lets the Leinwand show the KO-Baum (project plan 3.3)
        // without a login. Pass tournamentId to target a specific tournament
        // (needed once an event runs multiple tournaments side by side).
        // Without it, resolves a tournament by itself for backward
        // compatibility with single-tournament events: preferring one whose
        // final phase has started, falling back to the most recently
        // finished one so the bracket keeps showing the result afterwards.
        app.MapGet("/api/events/{eventId:guid}/knockout", async (Guid eventId, Guid? tournamentId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Tournaments).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            var tournament = tournamentId is { } id
                ? eventEntity.Tournaments.FirstOrDefault(t => t.Id == id)
                : eventEntity.Tournaments.FirstOrDefault(t => t.Status == TournamentStatus.FinalStarted)
                    ?? eventEntity.Tournaments.FirstOrDefault(t => t.Status == TournamentStatus.Finished);
            if (tournament is null)
                return Results.NotFound();

            var matches = await db.KnockoutMatches.Where(m => m.TournamentId == tournament.Id).ToListAsync();
            return Results.Ok(new EventKnockoutDto(tournament.Id, await ToDtosAsync(matches, db)));
        });
    }

    private static Guid? Loser(KnockoutMatch match)
    {
        if (match.WinnerId is null) return null;
        if (match.Player1Id == match.WinnerId) return match.Player2Id;
        if (match.Player2Id == match.WinnerId) return match.Player1Id;
        return null;
    }

    /// <summary>
    /// Players eligible to be substituted in right now: real losers of
    /// decided matches, plus qualified players (from the qualification
    /// leaderboard) who were never assigned a bracket slot at all - this
    /// covers a round-1 no-show, where nobody has been eliminated yet to
    /// draw from. Excludes anyone who's since won a match (including a bye,
    /// whose winner is decided immediately) or still occupies an undecided
    /// one, so nobody still alive in the bracket can accidentally be pulled
    /// out, and nobody can be picked as a substitute twice at once.
    /// </summary>
    private static async Task<List<Guid>> GetEligibleSubstituteIdsAsync(Guid tournamentId, DartsDbContext db)
    {
        var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
        var allMatches = await db.KnockoutMatches.Where(m => m.TournamentId == tournamentId).ToListAsync();

        var everAssignedIds = allMatches
            .SelectMany(m => new[] { m.Player1Id, m.Player2Id })
            .Where(id => id is not null)
            .Select(id => id!.Value);

        var leaderboard = await TournamentEndpoints.GetLeaderboardEntriesAsync(tournamentId, tournament?.QualificationBestOf, db);
        var qualifiedIds = leaderboard.Select(e => e.PlayerId);

        var stillInTournamentIds = allMatches
            .Where(m => m.WinnerId is not null)
            .Select(m => m.WinnerId!.Value)
            .Concat(allMatches
                .Where(m => m.WinnerId is null)
                .SelectMany(m => new[] { m.Player1Id, m.Player2Id })
                .Where(id => id is not null)
                .Select(id => id!.Value))
            .ToHashSet();

        return qualifiedIds
            .Concat(everAssignedIds)
            .Distinct()
            .Where(id => !stillInTournamentIds.Contains(id))
            .ToList();
    }

    /// <summary>
    /// Standard single-elimination seed order (Setzliste), e.g. for size 8:
    /// 1,8,4,5,2,7,3,6 so match pairs are 1v8, 4v5, 2v7, 3v6 - the best
    /// seeds only meet late in the bracket.
    /// </summary>
    internal static List<int> BuildSeedOrder(int bracketSize)
    {
        var seeds = new List<int> { 1 };
        while (seeds.Count < bracketSize)
        {
            var n = seeds.Count * 2 + 1;
            var next = new List<int>(seeds.Count * 2);
            foreach (var s in seeds)
            {
                next.Add(s);
                next.Add(n - s);
            }
            seeds = next;
        }
        return seeds;
    }

    // A tied leg has no fair answer from the scores alone (previously this
    // just returned OrderByDescending's first result, silently crediting an
    // arbitrary player with the win on an exact tie) - it waits for
    // TiebreakWinnerId (set via GameEndpoints' resolve-tie, "Gleiche
    // Punktzahl!" on the Tablet) instead of resolving on its own.
    internal static Guid? WinnerOf(Game game) =>
        game.IsTied ? game.TiebreakWinnerId : game.Entries.OrderByDescending(e => e.Total).FirstOrDefault()?.PlayerId;

    internal static async Task<List<KnockoutMatchDto>> ToDtosAsync(List<KnockoutMatch> matches, DartsDbContext db)
    {
        var matchIds = matches.Select(m => m.Id).ToList();
        var legs = await db.Games
            .Where(g => g.KnockoutMatchId != null && matchIds.Contains(g.KnockoutMatchId!.Value))
            .ToListAsync();

        var playerIds = matches.SelectMany(m => new[] { m.Player1Id, m.Player2Id, m.WinnerId })
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
        var names = await db.Players.Where(p => playerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, p => p.DisplayName);

        return matches
            .OrderBy(m => m.Round).ThenBy(m => m.IsThirdPlaceMatch).ThenBy(m => m.Position)
            .Select(m =>
            {
                var matchLegs = legs.Where(g => g.KnockoutMatchId == m.Id).OrderBy(g => g.StartedAt).ToList();
                var player1Legs = matchLegs.Count(g => g.Status == GameStatus.Finished && WinnerOf(g) == m.Player1Id);
                var player2Legs = matchLegs.Count(g => g.Status == GameStatus.Finished && WinnerOf(g) == m.Player2Id);

                return new KnockoutMatchDto(
                    m.Id, m.Round, m.Position, m.BestOfLegs, m.IsThirdPlaceMatch,
                    m.Player1Id, m.Player1Id is { } p1 ? names.GetValueOrDefault(p1, "?") : null,
                    m.Player2Id, m.Player2Id is { } p2 ? names.GetValueOrDefault(p2, "?") : null,
                    m.WinnerId, m.WinnerId is { } w ? names.GetValueOrDefault(w, "?") : null,
                    player1Legs, player2Legs,
                    matchLegs.Select(g => g.Id).ToList());
            })
            .ToList();
    }
}

public record StartKnockoutRequest(int ParticipantCount, int BestOfLegs, int? QualificationBestOf, List<Guid>? SeededPlayerIds = null);

public record NextRoundRequest(int? BestOfLegs);

public record CreateKnockoutGameRequest(Guid BoardId);

public record SubstitutePlayerRequest(Guid OutgoingPlayerId, Guid IncomingPlayerId);

public record AvailableSubstituteDto(Guid PlayerId, string PlayerName);

public record KnockoutMatchDto(
    Guid Id, int Round, int Position, int BestOfLegs, bool IsThirdPlaceMatch,
    Guid? Player1Id, string? Player1Name,
    Guid? Player2Id, string? Player2Name,
    Guid? WinnerId, string? WinnerName,
    int Player1Legs, int Player2Legs,
    List<Guid> GameIds);

public record EventKnockoutDto(Guid TournamentId, List<KnockoutMatchDto> Matches);
