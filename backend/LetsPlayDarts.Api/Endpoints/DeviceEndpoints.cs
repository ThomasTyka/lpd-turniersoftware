using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Domain.ValueObjects;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// Device pairing (Tablet/Monitor to Board). Anonymous - a Tablet or
/// Monitor identifies itself with a client-generated id, not a Regie
/// login (see project plan 3.1).
/// </summary>
public static class DeviceEndpoints
{
    // Fixed in code rather than configurable per event - shared, spoken-
    // aloud-at-the-venue PIN like a WiFi password, not an account
    // credential.
    private const string TabletPairingPin = "4719";

    public static void MapDeviceEndpoints(this WebApplication app)
    {
        var devices = app.MapGroup("/api/events/{eventId:guid}/devices");

        // Regie-only device management overview, with live online status
        // ("Geräteverwaltung: ... mit Online-/Offline-Status in Echtzeit").
        devices.MapGet("/", async (Guid eventId, DartsDbContext db, IDeviceOnlineTracker onlineTracker) =>
        {
            var boardNames = await db.Boards
                .Where(b => EF.Property<Guid>(b, "EventId") == eventId)
                .ToDictionaryAsync(b => b.Id, b => b.Name ?? $"Board {b.Number}");

            var list = await db.Devices
                .Where(d => d.EventId == eventId)
                .ToListAsync();

            return Results.Ok(list.Select(d => new DeviceStatusDto(
                d.ClientDeviceId,
                d.Type,
                d.BoardId,
                boardNames.GetValueOrDefault(d.BoardId, d.BoardId.ToString()),
                d.PairedAt,
                d.ExpiresAt,
                onlineTracker.IsOnline(d.ClientDeviceId))));
        }).RequireAuthorization();

        // Anonymous, minimal board listing so a pairing screen can offer a
        // choice without needing a Regie login. Includes each board's
        // Monitor online status ("Jeder Eintrag zeigt Online/Offline an"
        // from the project plan) so you can see whether a board is
        // actually reachable before pairing a Tablet to it.
        app.MapGet("/api/events/{eventId:guid}/pairing/boards", async (Guid eventId, DartsDbContext db, IDeviceOnlineTracker onlineTracker) =>
        {
            var boards = await db.Boards
                .Where(b => EF.Property<Guid>(b, "EventId") == eventId)
                .OrderBy(b => b.Number)
                .ToListAsync();

            var monitorBoardIds = await db.Devices
                .Where(d => d.EventId == eventId && d.Type == DeviceType.Monitor)
                .Select(d => new { d.BoardId, d.ClientDeviceId })
                .ToListAsync();
            var onlineBoardIds = monitorBoardIds
                .Where(d => onlineTracker.IsOnline(d.ClientDeviceId))
                .Select(d => d.BoardId)
                .ToHashSet();

            return Results.Ok(boards.Select(b => new PairingBoardDto(b.Id, b.Number, b.Name, onlineBoardIds.Contains(b.Id))));
        });

        // Anonymous - lets a paired Tablet start a game itself: the
        // existing player roster to pick from, plus the tournament to
        // create the game under. An event practically always has exactly
        // one tournament (old system's model), so the first one found is
        // used without asking; an event with none yet has nothing to
        // start a game in regardless. Also returns that tournament's
        // current qualification settings, so the Tablet's mode/rounds
        // picker can show what the next game would inherit rather than
        // always starting from a hardcoded default.
        app.MapGet("/api/events/{eventId:guid}/pairing/roster", async (Guid eventId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events
                .Include(e => e.Players)
                .Include(e => e.Tournaments)
                .FirstOrDefaultAsync(e => e.Id == eventId);
            if (eventEntity is null)
                return Results.NotFound();

            var players = eventEntity.Players.Select(p => new PairingPlayerDto(p.Id, p.DisplayName)).ToList();
            var tournament = eventEntity.Tournaments.FirstOrDefault();
            return Results.Ok(new PairingRosterDto(players, tournament?.Id, tournament?.QualificationSettings));
        });

        // Regie-only: unpairs a device outright, without another device
        // needing to take its place first (see the force=true override
        // flow in /pair below, which only removes a device by replacing
        // it). Lets you e.g. clear a stale test pairing from a board.
        devices.MapDelete("/{clientDeviceId:guid}", async (Guid eventId, Guid clientDeviceId, DartsDbContext db) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d => d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null)
                return Results.NotFound();

            db.Devices.Remove(device);
            await db.SaveChangesAsync();
            return Results.NoContent();
        }).RequireAuthorization();

        // Look up an existing pairing by client device id - lets a device
        // that already paired find its board again after a restart/crash.
        // An expired pairing ("Zeitfenster (von-bis)", project plan 3.1) is
        // treated as if it never existed - the device goes back through
        // the picker rather than resuming a board it's no longer meant to
        // be on.
        devices.MapGet("/{clientDeviceId:guid}", async (Guid eventId, Guid clientDeviceId, DartsDbContext db) =>
            await db.Devices.FirstOrDefaultAsync(d => d.EventId == eventId && d.ClientDeviceId == clientDeviceId)
                is { } device && !device.IsExpired
                ? Results.Ok(ToDto(device))
                : Results.NotFound());

        devices.MapPost("/pair", async (Guid eventId, PairDeviceRequest request, DartsDbContext db) =>
        {
            var board = await db.Boards.FirstOrDefaultAsync(b => b.Id == request.BoardId);
            if (board is null)
                return Results.NotFound("Board not found.");

            // Tablet pairing is gated behind a fixed, shared PIN ("Pairing
            // Tablet-Monitor soll Passwort gesichert sein") - Monitor
            // pairing isn't covered yet by design (first iteration, scoped
            // to Tablet only).
            if (request.Type == DeviceType.Tablet && !string.Equals(request.Pin, TabletPairingPin, StringComparison.Ordinal))
                return Results.Json("Falscher PIN.", statusCode: StatusCodes.Status401Unauthorized);

            if (request.ValidForMinutes is <= 0)
                return Results.BadRequest("validForMinutes must be positive.");
            DateTime? expiresAt = request.ValidForMinutes is { } minutes
                ? DateTime.UtcNow.AddMinutes(minutes)
                : null;

            var existingForBoard = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.BoardId == request.BoardId && d.Type == request.Type);

            if (existingForBoard is not null
                && existingForBoard.ClientDeviceId != request.ClientDeviceId
                && !existingForBoard.IsExpired
                && !request.Force)
            {
                return Results.Conflict(
                    $"This board already has a {request.Type} paired. Pass force=true to take it over.");
            }

            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == request.ClientDeviceId && d.Type == request.Type);

            if (device is null)
            {
                device = new Device(request.ClientDeviceId, eventId, request.Type, request.BoardId, expiresAt);
                db.Devices.Add(device);
            }
            else
            {
                device.Repair(request.BoardId, expiresAt);
            }

            // If another device held this board, it gets displaced (only one
            // device per type per board - see project plan's override protection).
            if (existingForBoard is not null && existingForBoard.ClientDeviceId != request.ClientDeviceId)
                db.Devices.Remove(existingForBoard);

            await db.SaveChangesAsync();
            return Results.Ok(ToDto(device));
        });

        // Anonymous - an unpaired Monitor announces itself every ~15s while
        // sitting on its "Warte auf Zuweisung" screen, so the Regie can see
        // and assign it without anyone touching the device itself
        // ("Geräteverwaltung: ... alles vom Notebook aus änderbar",
        // project plan 3.2).
        app.MapPost("/api/events/{eventId:guid}/devices/announce", (Guid eventId, AnnounceDeviceRequest request, IUnassignedDeviceTracker tracker) =>
        {
            tracker.Announce(eventId, request.ClientDeviceId, request.Type, request.ShortCode);
            return Results.NoContent();
        });

        // Regie-only - the list a "Warten auf Zuweisung" panel assigns from.
        devices.MapGet("/unassigned", (Guid eventId, IUnassignedDeviceTracker tracker) =>
            Results.Ok(tracker.GetForEvent(eventId))).RequireAuthorization();

        // Regie-only - assigns a board directly from the Notebook, without
        // the device itself picking anything. Same take-over semantics as
        // the device-initiated /pair above, minus the PIN/time-window
        // options, which only make sense for a device pairing itself.
        devices.MapPost("/{clientDeviceId:guid}/assign", async (Guid eventId, Guid clientDeviceId, AssignDeviceRequest request, DartsDbContext db, IUnassignedDeviceTracker tracker) =>
        {
            var board = await db.Boards.FirstOrDefaultAsync(b => b.Id == request.BoardId);
            if (board is null)
                return Results.NotFound("Board not found.");

            var existingForBoard = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.BoardId == request.BoardId && d.Type == request.Type);

            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId && d.Type == request.Type);

            if (device is null)
            {
                device = new Device(clientDeviceId, eventId, request.Type, request.BoardId, null);
                db.Devices.Add(device);
            }
            else
            {
                device.Repair(request.BoardId, null);
            }

            if (existingForBoard is not null && existingForBoard.ClientDeviceId != clientDeviceId)
                db.Devices.Remove(existingForBoard);

            await db.SaveChangesAsync();
            tracker.Remove(clientDeviceId);
            return Results.Ok(ToDto(device));
        }).RequireAuthorization();

        // Anonymous, but scoped: a Tablet can only submit scores for the
        // board it is actually paired to, not an arbitrary one - "Tablets
        // können nur Scores für ihr Board eingeben" from the project plan.
        devices.MapPost("/{clientDeviceId:guid}/turns", async (
            Guid eventId, Guid clientDeviceId, SubmitTabletTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null || device.IsExpired)
                return Results.NotFound("Device is not paired.");

            if (device.Type != DeviceType.Tablet)
                return Results.BadRequest("Only a Tablet can submit turns this way.");

            var game = await db.Games
                .Where(g => g.BoardId == device.BoardId && g.Status == GameStatus.InProgress)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Results.NotFound("No active game on this device's board.");

            try
            {
                game.RecordTurn(request.PlayerId, request.Score);
                await db.SaveChangesAsync();
                var dto = await GameEndpoints.ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(game.Id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Same pairing-scoped authorization as submitting a turn - a Tablet
        // can only undo turns for the game currently running on its own
        // board ("Wurf-Korrektur", project plan 3.1).
        devices.MapPost("/{clientDeviceId:guid}/turns/undo", async (
            Guid eventId, Guid clientDeviceId, UndoTabletTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null || device.IsExpired)
                return Results.NotFound("Device is not paired.");

            if (device.Type != DeviceType.Tablet)
                return Results.BadRequest("Only a Tablet can undo turns this way.");

            var game = await db.Games
                .Where(g => g.BoardId == device.BoardId)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Results.NotFound("No game found on this device's board.");

            try
            {
                game.RemoveLastTurn(request.PlayerId);
                await db.SaveChangesAsync();
                var dto = await GameEndpoints.ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(game.Id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Same pairing-scoped authorization as undoing a turn, but overwrites
        // one of the player's earlier throws in place instead of only being
        // able to remove the latest one ("Wurf-Korrektur" on an arbitrary
        // past throw, matching the old system's per-throw edit screen).
        devices.MapPost("/{clientDeviceId:guid}/turns/edit", async (
            Guid eventId, Guid clientDeviceId, EditTabletTurnRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null || device.IsExpired)
                return Results.NotFound("Device is not paired.");

            if (device.Type != DeviceType.Tablet)
                return Results.BadRequest("Only a Tablet can edit turns this way.");

            var game = await db.Games
                .Where(g => g.BoardId == device.BoardId)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Results.NotFound("No game found on this device's board.");

            try
            {
                game.SetPlayerThrow(request.PlayerId, request.ThrowIndex, request.Score);
                await db.SaveChangesAsync();
                var dto = await GameEndpoints.ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(game.Id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);
                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException or ArgumentOutOfRangeException)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Same pairing-scoped authorization as the other Tablet actions -
        // lets the scorer abandon the game currently running on their own
        // board (the Tablet's nav menu's "Beenden"/"Bearbeiten"), without
        // needing the Regie to delete it. Same hard delete as the Regie's
        // own DELETE .../games/{id} - but unlike that one, this DOES
        // broadcast: a paired Board-Monitor has no other way to learn its
        // game just disappeared (no polling, only "gameStarted"/
        // "gameUpdated" push events), and without it the Monitor was stuck
        // showing the abandoned game forever instead of falling back to its
        // idle/QR screen.
        devices.MapPost("/{clientDeviceId:guid}/games/cancel", async (
            Guid eventId, Guid clientDeviceId, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null || device.IsExpired)
                return Results.NotFound("Device is not paired.");

            if (device.Type != DeviceType.Tablet)
                return Results.BadRequest("Only a Tablet can cancel a game this way.");

            var game = await db.Games
                .Where(g => g.BoardId == device.BoardId && g.Status == GameStatus.InProgress)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Results.NotFound("No active game on this device's board.");

            db.Games.Remove(game);
            await db.SaveChangesAsync();
            await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameCancelled");
            return Results.NoContent();
        });

        // Same pairing-scoped authorization as submitting/undoing a turn -
        // resolves a knockout leg that finished tied ("Gleiche Punktzahl!",
        // matching the old system's tablet-side tie dialog - see
        // Game.ResolveTie). Re-runs the knockout match's leg tally
        // afterward since it was skipped while the leg sat unresolved.
        devices.MapPost("/{clientDeviceId:guid}/resolve-tie", async (
            Guid eventId, Guid clientDeviceId, ResolveGameTieRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var device = await db.Devices.FirstOrDefaultAsync(d =>
                d.EventId == eventId && d.ClientDeviceId == clientDeviceId);
            if (device is null || device.IsExpired)
                return Results.NotFound("Device is not paired.");

            if (device.Type != DeviceType.Tablet)
                return Results.BadRequest("Only a Tablet can resolve a tie this way.");

            var game = await db.Games
                .Where(g => g.BoardId == device.BoardId)
                .OrderByDescending(g => g.StartedAt)
                .FirstOrDefaultAsync();
            if (game is null)
                return Results.NotFound("No game found on this device's board.");

            try
            {
                game.ResolveTie(request.WinnerId);
                await db.SaveChangesAsync();
                var dto = await GameEndpoints.ToDtoAsync(game, db);
                await hub.Clients.Group(GameHub.GroupName(game.Id)).SendAsync("gameUpdated", dto);
                await hub.Clients.Group(GameHub.BoardGroupName(game.BoardId)).SendAsync("gameUpdated", dto);

                if (game.KnockoutMatchId is { } matchId)
                    await GameEndpoints.ApplyKnockoutLegResultAsync(matchId, db, hub);

                return Results.Ok(dto);
            }
            catch (Exception ex) when (ex is ArgumentException or InvalidOperationException)
            {
                return Results.BadRequest(ex.Message);
            }
        });
    }

    private static DeviceDto ToDto(Device device) => new(
        device.ClientDeviceId, device.EventId, device.Type, device.BoardId, device.PairedAt, device.ExpiresAt);
}

public record PairDeviceRequest(Guid ClientDeviceId, DeviceType Type, Guid BoardId, bool Force = false, int? ValidForMinutes = null, string? Pin = null);

public record AnnounceDeviceRequest(Guid ClientDeviceId, DeviceType Type, string ShortCode);

public record AssignDeviceRequest(Guid BoardId, DeviceType Type);

public record DeviceDto(Guid ClientDeviceId, Guid EventId, DeviceType Type, Guid BoardId, DateTime PairedAt, DateTime? ExpiresAt);

public record PairingBoardDto(Guid Id, int Number, string? Name, bool MonitorOnline);

public record SubmitTabletTurnRequest(Guid PlayerId, int Score);

public record UndoTabletTurnRequest(Guid PlayerId);

public record EditTabletTurnRequest(Guid PlayerId, int ThrowIndex, int Score);

public record DeviceStatusDto(Guid ClientDeviceId, DeviceType Type, Guid BoardId, string BoardName, DateTime PairedAt, DateTime? ExpiresAt, bool IsOnline);

public record PairingPlayerDto(Guid Id, string DisplayName);

public record PairingRosterDto(List<PairingPlayerDto> Players, Guid? TournamentId, GameSettings? QualificationSettings);
