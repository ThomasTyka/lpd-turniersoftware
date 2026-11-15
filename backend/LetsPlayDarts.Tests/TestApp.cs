using System.Security.Cryptography;
using LetsPlayDarts.Domain.Entities;
using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Domain.ValueObjects;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace LetsPlayDarts.Tests;

/// <summary>
/// Startet die echte App gegen eine eigene, frische SQLite-Datei pro
/// Testklasse (Migrationen laufen wie im Betrieb beim Start).
/// </summary>
public sealed class TestApp : WebApplicationFactory<Program>
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"lpd-test-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:DartsDb", $"Data Source={_dbPath}");
        builder.UseSetting("Auth:Username", "test");
        builder.UseSetting("Auth:PasswordHash", "1.AAAA.AAAA");
        builder.UseSetting("Auth:JwtSigningKey", Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)));
        builder.UseSetting("Storage:UploadRoot", Path.Combine(Path.GetTempPath(), $"lpd-test-uploads-{Guid.NewGuid():N}"));
    }

    /// <summary>Legt Event, Board, Spieler, Turnier, gekoppeltes Tablet und ein laufendes Highscore-Spiel an.</summary>
    public async Task<Fixture> SeedGameAsync(int playerCount = 2, int rounds = 3)
    {
        // Ensures the host (and its startup migration) has run.
        _ = Server;
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DartsDbContext>();

        var ev = new Event("Test-Event", "Kunde", DateTime.UtcNow.Date, "Halle");
        var board = new Board(1);
        ev.AddBoard(board);
        var players = Enumerable.Range(1, playerCount).Select(i => new Player($"Spieler{i}", "Test")).ToList();
        foreach (var p in players) ev.AddPlayer(p);
        var tournament = new Tournament(new GameSettings(GameMode.Highscore, rounds: rounds), new GameSettings(GameMode.Highscore, rounds: rounds));
        ev.AddTournament(tournament);
        db.Events.Add(ev);

        var tabletId = Guid.NewGuid();
        db.Devices.Add(new Device(tabletId, ev.Id, DeviceType.Tablet, board.Id));

        var game = new Game(tournament.Id, board.Id, GameMode.Highscore, rounds, null, players.Select(p => p.Id));
        db.Games.Add(game);
        await db.SaveChangesAsync();

        return new Fixture(ev.Id, board.Id, tabletId, game.Id, players.Select(p => p.Id).ToList());
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        foreach (var suffix in new[] { "", "-shm", "-wal" })
        {
            try { File.Delete(_dbPath + suffix); } catch (IOException) { }
        }
    }
}

public record Fixture(Guid EventId, Guid BoardId, Guid TabletId, Guid GameId, List<Guid> PlayerIds)
{
    public string TurnsUrl => $"/api/events/{EventId}/devices/{TabletId}/turns";
}
