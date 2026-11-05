using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Domain.ValueObjects;
using LetsPlayDarts.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

public static class TournamentEndpoints
{
    public static void MapTournamentEndpoints(this WebApplication app)
    {
        var tournaments = app.MapGroup("/api/events/{eventId:guid}/tournaments").RequireAuthorization();

        // Anonymous - lets a paired Tablet create a starter tournament for
        // its event when none exists yet, so "Spiel starten" never dead-ends
        // on a missing Regie setup step (same project plan decision as
        // player registration and game creation above).
        tournaments.MapPost("/", async (Guid eventId, CreateTournamentRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events
                .Include(e => e.Tournaments)
                .FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            // Multiple tournaments can run side by side in one event (each
            // with its own players/boards, managed by the Regie - see
            // "Mehrere Turniere" requirement). Superseded ADR-001, which
            // restricted events to a single active tournament.
            try
            {
                var qualificationSettings = new GameSettings(request.QualificationMode, request.QualificationStartScore, request.QualificationRounds);
                var finalSettings = new GameSettings(request.FinalMode, request.FinalStartScore, request.FinalRounds);
                var tournament = new Tournament(qualificationSettings, finalSettings, request.QualificationBestOf);
                eventEntity.AddTournament(tournament);
                await db.SaveChangesAsync();
                return Results.Created($"/api/events/{eventId}/tournaments/{tournament.Id}", tournament);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).AllowAnonymous();

        tournaments.MapGet("/{id:guid}", async (Guid eventId, Guid id, DartsDbContext db) =>
            await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id)
                is { } tournament
                ? Results.Ok(tournament)
                : Results.NotFound());

        // Powers the "Status & Einstellungen"-Zusammenfassung (mirrors the
        // old system's EventDashboard: active-game warning, plus - once the
        // final phase started - the current KO round's winners once it's
        // fully decided).
        tournaments.MapGet("/{id:guid}/overview", async (Guid eventId, Guid id, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            var activeGamesCount = await db.Games.CountAsync(g => g.TournamentId == id && g.Status == GameStatus.InProgress);

            List<TournamentOverviewWinnerDto>? currentRoundWinners = null;
            if (tournament.Status == TournamentStatus.FinalStarted)
            {
                var bracketMatches = await db.KnockoutMatches
                    .Where(m => m.TournamentId == id && !m.IsThirdPlaceMatch)
                    .ToListAsync();
                if (bracketMatches.Count > 0)
                {
                    var currentRound = bracketMatches.Max(m => m.Round);
                    var currentMatches = bracketMatches.Where(m => m.Round == currentRound).ToList();
                    if (currentMatches.All(m => m.WinnerId is not null))
                    {
                        var winnerIds = currentMatches.Select(m => m.WinnerId!.Value).ToList();
                        var names = await db.Players
                            .Where(p => winnerIds.Contains(p.Id))
                            .ToDictionaryAsync(p => p.Id, p => p.DisplayName);
                        currentRoundWinners = winnerIds
                            .Select(playerId => new TournamentOverviewWinnerDto(playerId, names.GetValueOrDefault(playerId, "?")))
                            .ToList();
                    }
                }
            }

            return Results.Ok(new TournamentOverviewDto(activeGamesCount, currentRoundWinners));
        });

        tournaments.MapDelete("/{id:guid}", async (Guid eventId, Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Tournaments).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            var tournament = eventEntity.Tournaments.FirstOrDefault(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            // Game/KnockoutMatch/GroupRound only carry a plain TournamentId -
            // no FK relationship is configured for them (see EventEndpoints's
            // DELETE), so they'd otherwise be left behind as orphaned rows.
            db.Games.RemoveRange(db.Games.Where(g => g.TournamentId == id));
            db.KnockoutMatches.RemoveRange(db.KnockoutMatches.Where(m => m.TournamentId == id));
            db.GroupRounds.RemoveRange(db.GroupRounds.Where(g => g.TournamentId == id));

            eventEntity.RemoveTournament(tournament);
            db.Tournaments.Remove(tournament);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // Free status jump to any value at any time, mirroring the old
        // system's phase dropdown (updateEvent with an arbitrary phase, no
        // server-side validation - only a UI warning not to do this while
        // games are running).
        tournaments.MapPut("/{id:guid}/status", async (Guid eventId, Guid id, SetTournamentStatusRequest request, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            tournament.SetStatus(request.Status);
            await db.SaveChangesAsync();
            return Results.Ok(tournament);
        });

        // Qualification ranking: "Summe der besten X Spiele" (project plan,
        // Abschnitt 2). Only finished games count - a game in progress
        // hasn't produced a final total yet. bestOf is optional; omit it to
        // fall back to the tournament's own persistent QualificationBestOf
        // setting (or every finished game, if that isn't set either).
        tournaments.MapGet("/{id:guid}/leaderboard", async (Guid eventId, Guid id, int? bestOf, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            if (bestOf is <= 0)
                return Results.BadRequest("bestOf must be positive.");

            return Results.Ok(await GetLeaderboardEntriesAsync(id, bestOf ?? tournament.QualificationBestOf, db));
        });

        tournaments.MapPut("/{id:guid}/qualification-best-of", async (Guid eventId, Guid id, SetQualificationBestOfRequest request, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            try
            {
                tournament.SetQualificationBestOf(request.QualificationBestOf);
                await db.SaveChangesAsync();
                return Results.Ok(tournament);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Free manual override of "which KO phase are we in" - mirrors the
        // old system's phase dropdown, completely decoupled from the real
        // bracket data (see Tournament.KnockoutPhaseOverride).
        tournaments.MapPut("/{id:guid}/knockout-phase-override", async (Guid eventId, Guid id, SetKnockoutPhaseOverrideRequest request, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            tournament.SetKnockoutPhaseOverride(request.KnockoutPhaseOverride);
            await db.SaveChangesAsync();
            return Results.Ok(tournament);
        });

        // Mode/rounds/start score stay editable for the tournament's whole
        // lifetime, regardless of Status - mirrors the old system, where
        // these settings were plain Event fields changeable at any time.
        // Only games created after the change pick up the new settings.
        // Anonymous for the same reason tournament creation is: a Tablet's
        // "Neues Spiel" screen lets the scorer pick mode/rounds per game,
        // same as the old software (which had no shared tournament concept
        // at all - every game carried its own settings) - so it needs to
        // update these before creating each game, not just when one didn't
        // exist yet.
        tournaments.MapPut("/{id:guid}/qualification-settings", async (Guid eventId, Guid id, EditGameSettingsRequest request, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            try
            {
                tournament.EditQualificationSettings(new GameSettings(request.Mode, request.StartScore, request.Rounds));
                await db.SaveChangesAsync();
                return Results.Ok(tournament);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        }).AllowAnonymous();

        tournaments.MapPut("/{id:guid}/final-settings", async (Guid eventId, Guid id, EditGameSettingsRequest request, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            try
            {
                tournament.EditFinalSettings(new GameSettings(request.Mode, request.StartScore, request.Rounds));
                await db.SaveChangesAsync();
                return Results.Ok(tournament);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Team ranking: same "Summe der besten X Spiele" idea as the
        // individual leaderboard, but a team's result for a given game is
        // the sum of its members' totals in that game (project plan: "Einzel-
        // oder Team-Variante"). Members still throw individually - this is a
        // pure aggregation over the same GameEntry data, no schema change to
        // Game itself.
        tournaments.MapGet("/{id:guid}/team-leaderboard", async (Guid eventId, Guid id, int? bestOf, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null)
                return Results.NotFound();

            if (bestOf is <= 0)
                return Results.BadRequest("bestOf must be positive.");

            var eventEntity = await db.Events.Include(e => e.Teams).FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            var finishedGames = await db.Games
                .Where(g => g.TournamentId == id && g.Status == GameStatus.Finished)
                .ToListAsync();

            var playerGameTotals = finishedGames
                .SelectMany(g => g.Entries.Select(e => new { GameId = g.Id, e.PlayerId, e.Total }))
                .ToList();

            var entries = eventEntity.Teams
                .Select(team =>
                {
                    var teamGameTotals = playerGameTotals
                        .Where(x => team.PlayerIds.Contains(x.PlayerId))
                        .GroupBy(x => x.GameId)
                        .Select(g => g.Sum(x => x.Total))
                        .OrderByDescending(t => t)
                        .ToList();
                    var counted = bestOf is { } n ? teamGameTotals.Take(n).ToList() : teamGameTotals;
                    return new TeamLeaderboardEntryDto(team.Id, team.Name, teamGameTotals.Count, counted.Count, counted.Sum());
                })
                .Where(e => e.GamesPlayed > 0)
                .OrderByDescending(e => e.Score)
                .ToList();

            return Results.Ok(entries);
        });
    }

    /// <summary>
    /// Qualification ranking: "Summe der besten X Spiele" (project plan,
    /// Abschnitt 2). Only finished games count - a game in progress hasn't
    /// produced a final total yet. bestOf is optional; omit it to sum every
    /// finished game a player has played in this tournament. Also used to
    /// seed the knockout bracket (see KnockoutEndpoints).
    /// </summary>
    internal static async Task<List<LeaderboardEntryDto>> GetLeaderboardEntriesAsync(Guid tournamentId, int? bestOf, DartsDbContext db)
    {
        var finishedGames = await db.Games
            .Where(g => g.TournamentId == tournamentId && g.Status == GameStatus.Finished)
            .ToListAsync();

        var playerTotals = finishedGames
            .SelectMany(g => g.Entries.Select(e => new { e.PlayerId, e.Total }))
            .GroupBy(x => x.PlayerId)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Total).OrderByDescending(t => t).ToList());

        var playerIds = playerTotals.Keys.ToList();
        var names = await db.Players
            .Where(p => playerIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => p.DisplayName);

        return playerTotals
            .Select(kv =>
            {
                var counted = bestOf is { } n ? kv.Value.Take(n).ToList() : kv.Value;
                return new LeaderboardEntryDto(
                    kv.Key,
                    names.GetValueOrDefault(kv.Key, "?"),
                    kv.Value.Count,
                    counted.Count,
                    counted.Sum(),
                    kv.Value);
            })
            .OrderByDescending(e => e.Score)
            .ToList();
    }

}

public record CreateTournamentRequest(
    GameMode QualificationMode,
    int? QualificationStartScore,
    int? QualificationRounds,
    GameMode FinalMode,
    int? FinalStartScore,
    int? FinalRounds,
    int? QualificationBestOf = null);

public record SetQualificationBestOfRequest(int? QualificationBestOf);

public record SetTournamentStatusRequest(TournamentStatus Status);

public record SetKnockoutPhaseOverrideRequest(string? KnockoutPhaseOverride);

public record EditGameSettingsRequest(GameMode Mode, int? StartScore, int? Rounds);

public record LeaderboardEntryDto(Guid PlayerId, string PlayerName, int GamesPlayed, int GamesCounted, int Score, List<int> GameScores);

public record TeamLeaderboardEntryDto(Guid TeamId, string TeamName, int GamesPlayed, int GamesCounted, int Score);

public record TournamentOverviewWinnerDto(Guid PlayerId, string PlayerName);

public record TournamentOverviewDto(int ActiveGamesCount, List<TournamentOverviewWinnerDto>? CurrentRoundWinners);
