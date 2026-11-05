using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Api.Endpoints;

/// <summary>
/// Leinwand scene-rotation configuration ("Szenen-System [...] Steuerung
/// vom Notebook", project plan 3.3).
/// </summary>
public static class LeinwandEndpoints
{
    public static void MapLeinwandEndpoints(this WebApplication app)
    {
        var events = app.MapGroup("/api/events/{eventId:guid}");

        // Anonymous - the Leinwand itself has no login, same as the other
        // public displays.
        events.MapGet("/leinwand-settings", async (Guid eventId, DartsDbContext db) =>
        {
            var settings = await db.LeinwandSettings.FirstOrDefaultAsync(s => s.EventId == eventId)
                ?? new LeinwandSettings(eventId);
            return Results.Ok(ToDto(settings));
        });

        events.MapPut("/leinwand-settings", async (Guid eventId, LeinwandSettingsRequest request, DartsDbContext db, IHubContext<GameHub> hub) =>
        {
            var settings = await db.LeinwandSettings.FirstOrDefaultAsync(s => s.EventId == eventId);
            if (settings is null)
            {
                settings = new LeinwandSettings(eventId);
                db.LeinwandSettings.Add(settings);
            }

            try
            {
                settings.Update(request.ActiveScenes, request.IntervalSeconds, request.PinnedScene);
            }
            catch (ArgumentException ex)
            {
                return Results.BadRequest(ex.Message);
            }

            await db.SaveChangesAsync();
            var dto = ToDto(settings);
            await hub.Clients.Group(GameHub.LeinwandGroupName(eventId)).SendAsync("leinwandSettingsUpdated", dto);
            return Results.Ok(dto);
        }).RequireAuthorization();

        // Anonymous - qualification leaderboard for the Leinwand's
        // "Vorrunden-Rangliste" scene. Events can run multiple tournaments
        // side by side; this picks whichever is currently Running, since
        // that's the one spectators actually care about live.
        events.MapGet("/leinwand-leaderboard", async (Guid eventId, DartsDbContext db) =>
        {
            var tournament = await db.Tournaments
                .Where(t => EF.Property<Guid>(t, "EventId") == eventId && t.Status == TournamentStatus.Running)
                .FirstOrDefaultAsync();
            if (tournament is null)
                return Results.NotFound();

            // Uses the tournament's own persistent QualificationBestOf
            // setting (mirrors the old system's event.bestOfX) rather than a
            // hardcoded number - set once in the Regie, applies everywhere
            // including here.
            return Results.Ok(await TournamentEndpoints.GetLeaderboardEntriesAsync(tournament.Id, tournament.QualificationBestOf, db));
        });
    }

    private static LeinwandSettingsDto ToDto(LeinwandSettings settings) =>
        new(settings.ActiveScenes, settings.IntervalSeconds, settings.PinnedScene);
}

public record LeinwandSettingsDto(IReadOnlyList<string> ActiveScenes, int IntervalSeconds, string? PinnedScene);

public record LeinwandSettingsRequest(IReadOnlyList<string> ActiveScenes, int IntervalSeconds, string? PinnedScene);
