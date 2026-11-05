using System.Diagnostics;
using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

public static class EventEndpoints
{
    private static readonly string[] AllowedLogoContentTypes = ["image/png", "image/jpeg", "image/svg+xml"];

    public static void MapEventEndpoints(this WebApplication app)
    {
        var events = app.MapGroup("/api/events").RequireAuthorization();

        events.MapPost("/", async (CreateEventRequest request, DartsDbContext db) =>
        {
            try
            {
                var newEvent = new Event(request.Name, request.CustomerName, request.EventDate, request.Location, request.PlannedBoardCount);
                for (var number = 1; number <= (request.PlannedBoardCount ?? 0); number++)
                    newEvent.AddBoard(new Board(number));
                db.Events.Add(newEvent);
                await db.SaveChangesAsync();
                return Results.Created($"/api/events/{newEvent.Id}", newEvent);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        // Newest/soonest event first by default - no explicit order previously
        // meant whatever order SQLite happened to return (roughly insertion
        // order, but not a guaranteed contract).
        events.MapGet("/", async (DartsDbContext db) =>
            await db.Events.OrderByDescending(e => e.EventDate).ToListAsync());

        events.MapDelete("/{id:guid}", async (Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Tournaments).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            // Players/Tournaments/Boards/Teams cascade automatically (see
            // DartsDbContext), but Game/KnockoutMatch/GroupRound only carry
            // a plain TournamentId - no FK relationship is configured for
            // them, so they'd otherwise be left behind as orphaned rows.
            var tournamentIds = eventEntity.Tournaments.Select(t => t.Id).ToList();
            db.Games.RemoveRange(db.Games.Where(g => tournamentIds.Contains(g.TournamentId)));
            db.KnockoutMatches.RemoveRange(db.KnockoutMatches.Where(m => tournamentIds.Contains(m.TournamentId)));
            db.GroupRounds.RemoveRange(db.GroupRounds.Where(g => tournamentIds.Contains(g.TournamentId)));
            db.Devices.RemoveRange(db.Devices.Where(d => d.EventId == id));
            db.LeinwandSettings.RemoveRange(db.LeinwandSettings.Where(s => s.EventId == id));

            db.Events.Remove(eventEntity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        events.MapPut("/{id:guid}", async (Guid id, EditEventRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                eventEntity.Edit(request.Name, request.CustomerName, request.EventDate, request.Location);
                await db.SaveChangesAsync();
                return Results.Ok(eventEntity);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapGet("/{id:guid}", async (Guid id, DartsDbContext db) =>
            await db.Events
                .Include(e => e.Players)
                .Include(e => e.Boards.OrderBy(b => b.Number))
                .Include(e => e.Tournaments)
                .Include(e => e.Teams)
                .FirstOrDefaultAsync(e => e.Id == id)
                is { } foundEvent
                ? Results.Ok(foundEvent)
                : Results.NotFound());

        // Regie-only (was briefly opened up to unauthenticated Tablets for
        // walk-up registration; reverted - adding/correcting a player is
        // Regie territory only, same as everything else in this group).
        events.MapPost("/{id:guid}/players", async (Guid id, CreatePlayerRequest request, DartsDbContext db) =>
        {
            // Include(Players) - AddPlayer's duplicate-display-name check
            // (EnsureUniqueDisplayName) needs the existing roster loaded to
            // compare against; FindAsync alone leaves it empty.
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                var player = new Player(request.FirstName, request.LastName, request.Nickname);
                eventEntity.AddPlayer(player);
                await db.SaveChangesAsync();
                return Results.Created($"/api/events/{id}/players/{player.Id}", player);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapPut("/{id:guid}/players/{playerId:guid}", async (Guid id, Guid playerId, CreatePlayerRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var player = eventEntity.Players.FirstOrDefault(p => p.Id == playerId);
            if (player is null)
                return Results.NotFound();

            try
            {
                eventEntity.RenamePlayer(playerId, request.FirstName, request.LastName, request.Nickname);
                await db.SaveChangesAsync();
                return Results.Ok(player);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapDelete("/{id:guid}/players/{playerId:guid}", async (Guid id, Guid playerId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var player = eventEntity.Players.FirstOrDefault(p => p.Id == playerId);
            if (player is null)
                return Results.NotFound();

            eventEntity.RemovePlayer(player);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // CSV-Import der Spielerliste ("CSV-Import/-Export der Spieler" - im
        // Projektplan gefordert, im alten System vorhanden, bei uns bisher
        // gefehlt). Erwartet eine Kopfzeile (Vorname,Nachname,Spitzname) -
        // fehlerhafte Zeilen (leerer Vor-/Nachname) werden übersprungen statt
        // den ganzen Import abzubrechen, damit eine einzelne Tippfehlerzeile
        // nicht die restliche Liste blockiert.
        events.MapPost("/{id:guid}/players/import", async (Guid id, IFormFile file, DartsDbContext db) =>
        {
            // Same as above - AddPlayer's duplicate check needs Players loaded.
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            if (file.Length == 0)
                return Results.BadRequest("CSV-Datei ist leer.");

            using var reader = new StreamReader(file.OpenReadStream());
            var lines = (await reader.ReadToEndAsync())
                .Split('\n')
                .Select(l => l.Trim().TrimEnd('\r'))
                .Where(l => l.Length > 0)
                .ToList();

            if (lines.Count > 0 && lines[0].Contains("Vorname", StringComparison.OrdinalIgnoreCase))
                lines.RemoveAt(0);

            var created = new List<Player>();
            var skipped = 0;

            foreach (var line in lines)
            {
                var columns = line.Split(',').Select(c => c.Trim().Trim('"')).ToArray();
                var firstName = columns.ElementAtOrDefault(0);
                var lastName = columns.ElementAtOrDefault(1);
                var nickname = columns.ElementAtOrDefault(2);

                try
                {
                    var player = new Player(firstName ?? "", lastName ?? "", string.IsNullOrWhiteSpace(nickname) ? null : nickname);
                    eventEntity.AddPlayer(player);
                    created.Add(player);
                }
                catch (ArgumentException)
                {
                    skipped++;
                }
            }

            await db.SaveChangesAsync();
            return Results.Ok(new ImportPlayersResultDto(created.Count, skipped, created));
        }).DisableAntiforgery();

        // CSV-Export der Spielerliste - Gegenstück zum Import, gleiches
        // Spaltenformat, damit eine exportierte Datei direkt wieder
        // importierbar ist (z.B. zum Anpassen in Excel und Re-Import).
        events.MapGet("/{id:guid}/players/export", async (Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var csv = new System.Text.StringBuilder("Vorname,Nachname,Spitzname\n");
            foreach (var player in eventEntity.Players)
                csv.Append($"{EscapeCsv(player.FirstName)},{EscapeCsv(player.LastName)},{EscapeCsv(player.Nickname ?? "")}\n");

            var bytes = System.Text.Encoding.UTF8.GetBytes(csv.ToString());
            return Results.File(bytes, "text/csv", $"spieler-{eventEntity.Name}.csv");
        });

        // Lets the "Neues Spiel"/player-picker UI grey out players who
        // can't actually be picked, instead of letting them be selected
        // and only finding out on submit (see FindPlayerAlreadyInProgressAsync -
        // same "a real person can't stand at two boards at once" rule,
        // just proactively reported for the whole event's roster at once).
        // Anonymous - the Tablet's own player picker needs this too (see
        // TabletScoreEntry.tsx's NewGameOnBoard), and it's an unauthenticated
        // device like the rest of its endpoints.
        events.MapGet("/{id:guid}/players/busy", async (Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Players).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var playerIds = eventEntity.Players.Select(p => p.Id).ToHashSet();
            var inProgressGames = await db.Games.Where(g => g.Status == GameStatus.InProgress).ToListAsync();
            var busyIds = inProgressGames
                .SelectMany(g => g.Entries)
                .Select(e => e.PlayerId)
                .Where(playerIds.Contains)
                .Distinct()
                .ToList();
            return Results.Ok(busyIds);
        }).AllowAnonymous();

        events.MapPost("/{id:guid}/boards", async (Guid id, CreateBoardRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                var board = new Board(request.Number, request.LocationDescription, request.Name);
                eventEntity.AddBoard(board);
                await db.SaveChangesAsync();
                return Results.Created($"/api/events/{id}/boards/{board.Id}", board);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapPut("/{id:guid}/boards/{boardId:guid}", async (Guid id, Guid boardId, RenameBoardRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Boards).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var board = eventEntity.Boards.FirstOrDefault(b => b.Id == boardId);
            if (board is null)
                return Results.NotFound();

            board.Rename(request.Name);
            await db.SaveChangesAsync();
            return Results.Ok(board);
        });

        events.MapPost("/{id:guid}/boards/shuffle-names", async (Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Boards).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var shuffled = BoardNamePool.Names.OrderBy(_ => Random.Shared.Next()).ToArray();
            var boards = eventEntity.Boards.OrderBy(b => b.Number).ToList();
            for (var i = 0; i < boards.Count; i++)
            {
                // More boards than pool entries: later boards keep whatever
                // name they already had rather than going nameless.
                if (i < shuffled.Length)
                    boards[i].Rename(shuffled[i]);
            }

            await db.SaveChangesAsync();
            return Results.Ok(boards);
        });

        events.MapDelete("/{id:guid}/boards/{boardId:guid}", async (Guid id, Guid boardId, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.Include(e => e.Boards).FirstOrDefaultAsync(e => e.Id == id);
            if (eventEntity is null)
                return Results.NotFound();

            var board = eventEntity.Boards.FirstOrDefault(b => b.Id == boardId);
            if (board is null)
                return Results.NotFound();

            // Devices only carry a plain BoardId (no FK relationship), so
            // paired devices are cleaned up explicitly rather than left
            // dangling on a board that no longer exists.
            db.Devices.RemoveRange(db.Devices.Where(d => d.BoardId == boardId));
            eventEntity.RemoveBoard(board);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        events.MapPut("/{id:guid}/planned-board-count", async (Guid id, SetPlannedBoardCountRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                eventEntity.SetPlannedBoardCount(request.PlannedBoardCount);
                await db.SaveChangesAsync();
                return Results.Ok(eventEntity);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapPut("/{id:guid}/branding", async (Guid id, SetBrandingRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            try
            {
                eventEntity.SetBranding(request.PrimaryColor, request.SecondaryColor);
                await db.SaveChangesAsync();
                await hub.Clients.Group(GameHub.LeinwandGroupName(id)).SendAsync("brandingUpdated");
                return Results.Ok(eventEntity);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }
        });

        events.MapPost("/{id:guid}/logo", async (Guid id, IFormFile file, DartsDbContext db, IConfiguration config, IHubContext<GameHub> hub) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            if (file.Length == 0)
                return Results.BadRequest("Logo file is empty.");

            if (!AllowedLogoContentTypes.Contains(file.ContentType))
                return Results.BadRequest($"Logo must be one of: {string.Join(", ", AllowedLogoContentTypes)}.");

            var uploadRoot = config["Storage:UploadRoot"] ?? "uploads";
            var logosDir = Path.Combine(uploadRoot, "logos");
            Directory.CreateDirectory(logosDir);

            var extension = file.ContentType switch
            {
                "image/png" => ".png",
                "image/jpeg" => ".jpg",
                "image/svg+xml" => ".svg",
                _ => throw new UnreachableException(),
            };
            // Each upload gets its own filename (not a fixed "{id}{extension}")
            // so replacing the logo actually changes the URL every consumer
            // builds via api.logoUrl(eventId, branding.logoVersion) - a
            // reused URL would otherwise keep serving the browser's cached
            // copy of the old image forever, since the <img> element's src
            // never changes and so never re-fetches.
            var fileName = $"{id}-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}{extension}";
            var fullPath = Path.Combine(logosDir, fileName);

            await using (var stream = File.Create(fullPath))
            {
                await file.CopyToAsync(stream);
            }

            var previousPath = eventEntity.LogoPath;
            var relativePath = Path.Combine("logos", fileName).Replace('\\', '/');
            eventEntity.SetLogoPath(relativePath);
            await db.SaveChangesAsync();

            if (previousPath is not null)
            {
                var previousFullPath = Path.GetFullPath(Path.Combine(uploadRoot, previousPath));
                if (File.Exists(previousFullPath))
                    File.Delete(previousFullPath);
            }

            await hub.Clients.Group(GameHub.LeinwandGroupName(id)).SendAsync("brandingUpdated");
            return Results.Ok(eventEntity);
        }).DisableAntiforgery();

        // Anonymous - a plain <img src> can't send an Authorization header,
        // and public displays (Leinwand, Board-Monitor, Tablet) need to show
        // the customer logo without a Regie login too.
        app.MapGet("/api/events/{id:guid}/logo", async (Guid id, DartsDbContext db, IConfiguration config) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity?.LogoPath is null)
                return Results.NotFound();

            var uploadRoot = config["Storage:UploadRoot"] ?? "uploads";
            var fullPath = Path.GetFullPath(Path.Combine(uploadRoot, eventEntity.LogoPath));
            if (!File.Exists(fullPath))
                return Results.NotFound();

            var contentType = Path.GetExtension(fullPath) switch
            {
                ".png" => "image/png",
                ".jpg" => "image/jpeg",
                ".svg" => "image/svg+xml",
                _ => "application/octet-stream",
            };
            return Results.File(fullPath, contentType);
        });

        // Anonymous - lets public displays (Leinwand, Board-Monitor, Tablet)
        // apply the customer's brand colors, logo and event name without a
        // Regie login.
        app.MapGet("/api/events/{id:guid}/branding", async (Guid id, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            return eventEntity is null
                ? Results.NotFound()
                : Results.Ok(new EventBrandingDto(
                    eventEntity.Name,
                    eventEntity.PrimaryColor,
                    eventEntity.SecondaryColor,
                    eventEntity.LogoPath is not null,
                    eventEntity.LogoPath is null ? null : Path.GetFileName(eventEntity.LogoPath)));
        });

        // Free status jump to any value at any time, mirroring the old
        // system's updateEvent(id, {status}) - a plain field write, no
        // server-side validation. Replaces the former guarded
        // activate/archive/unarchive endpoints.
        events.MapPut("/{id:guid}/status", async (Guid id, SetEventStatusRequest request, DartsDbContext db) =>
        {
            var eventEntity = await db.Events.FindAsync(id);
            if (eventEntity is null)
                return Results.NotFound();

            // Only one event can be Active at a time - GET /api/events/current
            // (the ?boardmonitor=current source of truth) picks whichever one
            // is, so activating a second event without deactivating the first
            // would leave that resolution ambiguous.
            if (request.Status == EventStatus.Active)
            {
                var othersActive = await db.Events
                    .Where(e => e.Id != id && e.Status == EventStatus.Active)
                    .ToListAsync();
                foreach (var other in othersActive)
                    other.SetStatus(EventStatus.Draft);
            }

            eventEntity.SetStatus(request.Status);
            await db.SaveChangesAsync();
            return Results.Ok(eventEntity);
        });

        // Anonymous - lets a Board-Monitor use one fixed URL
        // (?boardmonitor=current) across events instead of needing its
        // homepage/bookmark re-typed on the device for every new event
        // (the actual per-board assignment already happens from the Regie,
        // see the /devices/unassigned + /assign endpoints - this closes
        // the remaining "wrong eventId baked into the URL" friction).
        // Nothing enforces only one Active event at a time (see the status
        // endpoint above), so ties resolve to whichever has the latest
        // EventDate - "today's" event.
        app.MapGet("/api/events/current", async (DartsDbContext db) =>
        {
            var current = await db.Events
                .Where(e => e.Status == EventStatus.Active)
                .OrderByDescending(e => e.EventDate)
                .FirstOrDefaultAsync();

            return current is null ? Results.NotFound() : Results.Ok(new { current.Id });
        });
    }

    private static string EscapeCsv(string value) =>
        value.Contains(',') || value.Contains('"')
            ? $"\"{value.Replace("\"", "\"\"")}\""
            : value;
}

public record SetEventStatusRequest(EventStatus Status);

public record CreateEventRequest(string Name, string CustomerName, DateTime EventDate, string Location, int? PlannedBoardCount = null);

public record EditEventRequest(string Name, string CustomerName, DateTime EventDate, string Location);

public record CreatePlayerRequest(string FirstName, string LastName, string? Nickname);

public record ImportPlayersResultDto(int Created, int Skipped, List<Player> Players);

public record CreateBoardRequest(int Number, string? LocationDescription, string? Name = null);

public record RenameBoardRequest(string? Name);

public record SetPlannedBoardCountRequest(int? PlannedBoardCount);

public record SetBrandingRequest(string? PrimaryColor, string? SecondaryColor);

public record EventBrandingDto(string Name, string? PrimaryColor, string? SecondaryColor, bool HasLogo, string? LogoVersion);
