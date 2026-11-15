using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// Nimmt einen Wurf vom Tablet entgegen (E-17, P1-10).
///
/// - Jeder Wurf trägt eine Kennung (ClientTurnId). Ist sie schon bekannt,
///   wurde der Wurf bereits übernommen (die Antwort ging nur verloren) - der
///   Server antwortet dann mit dem aktuellen Stand und dem Kopf
///   <c>X-Turn-Result: duplicate</c>, zählt aber nichts doppelt.
/// - Passt der Wurf nicht (falsches/beendetes Spiel, nicht dran, Aufnahme
///   schon belegt ...), antwortet der Server mit 409 und einem festen Code
///   (<see cref="TurnRejectionCodes"/>), damit das Tablet den Grund anzeigen
///   kann statt den Wurf stillschweigend zu verwerfen.
/// </summary>
public static class TabletTurnHandler
{
    public const string ResultHeader = "X-Turn-Result";

    public static async Task<IResult> HandleAsync(
        Guid eventId, Guid clientDeviceId, SubmitTabletTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub)
    {
        var device = await db.Devices.FirstOrDefaultAsync(d => d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
        if (device is null || device.IsExpired)
            return Reject(TurnRejectionCodes.NotPaired, "Dieses Tablet ist keinem Board zugeordnet.", StatusCodes.Status404NotFound);

        if (device.Type != DeviceType.Tablet)
            return Reject(TurnRejectionCodes.NotPaired, "Nur ein Tablet kann Würfe eintragen.", StatusCodes.Status400BadRequest);

        if (request.ClientTurnId is { } knownId && await db.TurnSubmissions.AnyAsync(t => t.ClientTurnId == knownId))
            return await DuplicateAsync(knownId, db);

        Game? game;
        if (request.GameId is { } gameId)
        {
            game = await db.Games.FirstOrDefaultAsync(g => g.Id == gameId && g.BoardId == device.BoardId);
            if (game is null)
                return Reject(TurnRejectionCodes.GameNotFound, "Das Spiel gibt es an diesem Board nicht mehr (abgebrochen oder gelöscht).");
            if (game.Status != GameStatus.InProgress)
                return Reject(TurnRejectionCodes.GameFinished, "Das Spiel ist bereits beendet.");
        }
        else
        {
            game = await db.Games
                .Where(g => g.BoardId == device.BoardId && g.Status == GameStatus.InProgress)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Reject(TurnRejectionCodes.GameNotFound, "An diesem Board läuft kein Spiel.");
        }

        var entry = game.Entries.FirstOrDefault(e => e.PlayerId == request.PlayerId);
        if (entry is null)
            return Reject(TurnRejectionCodes.PlayerNotInGame, "Dieser Spieler gehört nicht zum Spiel.");

        if (request.RoundIndex is { } roundIndex)
        {
            if (roundIndex < entry.RoundScores.Count)
                return Reject(TurnRejectionCodes.RoundAlreadyRecorded, $"Aufnahme {roundIndex + 1} dieses Spielers ist schon eingetragen.");
            if (roundIndex > entry.RoundScores.Count)
                return Reject(TurnRejectionCodes.NotYourTurn, "Der Spieler ist noch nicht dran.");
        }

        if (game.CurrentTurnPlayerId != request.PlayerId)
            return Reject(TurnRejectionCodes.NotYourTurn, "Der Spieler ist noch nicht dran.");

        var recordedRoundIndex = entry.RoundScores.Count;
        try
        {
            game.RecordTurn(request.PlayerId, request.Score);
        }
        catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
        {
            return Reject(TurnRejectionCodes.InvalidScore, ex.Message);
        }

        if (request.ClientTurnId is { } newId)
            db.TurnSubmissions.Add(new TurnSubmission(newId, game.Id, request.PlayerId, game.BoardId, clientDeviceId, recordedRoundIndex, request.Score));

        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException) when (request.ClientTurnId is { } racedId)
        {
            // Derselbe Wurf kam zweimal gleichzeitig an - der andere hat ihn
            // schon gespeichert. Diese Änderung verwerfen und wie ein
            // Duplikat antworten.
            db.ChangeTracker.Clear();
            return await DuplicateAsync(racedId, db);
        }

        var dto = await GameEndpoints.ToDtoAsync(game, db);
        await hub.Clients.Group(GameHub.GroupName(game.Id)).SendAsync("gameUpdated", dto);
        await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
        return new TurnResult(dto, "recorded");
    }

    private static async Task<IResult> DuplicateAsync(Guid clientTurnId, DartsDbContext db)
    {
        var submission = await db.TurnSubmissions.FirstAsync(t => t.ClientTurnId == clientTurnId);
        var game = await db.Games.FirstOrDefaultAsync(g => g.Id == submission.GameId);
        if (game is null)
            return Reject(TurnRejectionCodes.GameNotFound, "Das Spiel gibt es an diesem Board nicht mehr (abgebrochen oder gelöscht).");

        return new TurnResult(await GameEndpoints.ToDtoAsync(game, db), "duplicate");
    }

    private static IResult Reject(string code, string message, int statusCode = StatusCodes.Status409Conflict) =>
        Results.Json(new TurnRejectionDto(code, message), statusCode: statusCode);

    /// <summary>200 mit dem Spielstand als Inhalt plus Kopf X-Turn-Result.</summary>
    private sealed class TurnResult(GameDto game, string result) : IResult
    {
        public Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.Headers[ResultHeader] = result;
            return Results.Ok(game).ExecuteAsync(httpContext);
        }
    }
}

public static class TurnRejectionCodes
{
    public const string NotPaired = "NotPaired";
    public const string GameNotFound = "GameNotFound";
    public const string GameFinished = "GameFinished";
    public const string PlayerNotInGame = "PlayerNotInGame";
    public const string NotYourTurn = "NotYourTurn";
    public const string RoundAlreadyRecorded = "RoundAlreadyRecorded";
    public const string InvalidScore = "InvalidScore";
}

public record TurnRejectionDto(string Code, string Message);
