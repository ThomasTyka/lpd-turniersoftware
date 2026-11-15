using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using LetsPlayDarts.Api.Endpoints;
using LetsPlayDarts.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace LetsPlayDarts.Tests;

/// <summary>E-17 / P1-10: Würfe vom Tablet mit Kennung, Duplikat-Erkennung und festen Ablehnungsgründen.</summary>
public class TabletTurnTests(TestApp app) : IClassFixture<TestApp>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private readonly HttpClient _client = app.CreateClient();

    private Task<HttpResponseMessage> Submit(Fixture f, Guid playerId, int score, Guid? clientTurnId = null, int? roundIndex = null, Guid? gameId = null) =>
        _client.PostAsJsonAsync(f.TurnsUrl, new { playerId, score, clientTurnId, gameId = gameId ?? f.GameId, roundIndex });

    private async Task<List<int>> ScoresOf(Fixture f, Guid playerId)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DartsDbContext>();
        var game = await db.Games.AsNoTracking().FirstAsync(g => g.Id == f.GameId);
        return game.Entries.First(e => e.PlayerId == playerId).RoundScores.ToList();
    }

    private static async Task<TurnRejectionDto> Rejection(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<TurnRejectionDto>(Json))!;

    [Fact]
    public async Task Wurf_wird_eingetragen_und_als_recorded_gemeldet()
    {
        var f = await app.SeedGameAsync();

        var response = await Submit(f, f.PlayerIds[0], 140, Guid.NewGuid(), roundIndex: 0);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("recorded", response.Headers.GetValues(TabletTurnHandler.ResultHeader).Single());
        Assert.Equal([140], await ScoresOf(f, f.PlayerIds[0]));
    }

    [Fact]
    public async Task Gleiche_Kennung_zweimal_zaehlt_nur_einmal()
    {
        var f = await app.SeedGameAsync();
        var turnId = Guid.NewGuid();

        var first = await Submit(f, f.PlayerIds[0], 100, turnId, roundIndex: 0);
        var second = await Submit(f, f.PlayerIds[0], 100, turnId, roundIndex: 0);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal("duplicate", second.Headers.GetValues(TabletTurnHandler.ResultHeader).Single());
        Assert.Equal([100], await ScoresOf(f, f.PlayerIds[0]));
    }

    [Fact]
    public async Task Duplikat_wird_auch_erkannt_wenn_inzwischen_weitergespielt_wurde()
    {
        var f = await app.SeedGameAsync();
        var turnId = Guid.NewGuid();

        await Submit(f, f.PlayerIds[0], 60, turnId, roundIndex: 0);
        await Submit(f, f.PlayerIds[1], 45, Guid.NewGuid(), roundIndex: 0);
        var resend = await Submit(f, f.PlayerIds[0], 60, turnId, roundIndex: 0);

        Assert.Equal(HttpStatusCode.OK, resend.StatusCode);
        Assert.Equal([60], await ScoresOf(f, f.PlayerIds[0]));
        Assert.Equal([45], await ScoresOf(f, f.PlayerIds[1]));
    }

    [Fact]
    public async Task Offline_Reihenfolge_wird_nacheinander_korrekt_uebernommen()
    {
        var f = await app.SeedGameAsync(playerCount: 2);

        // Drei Offline-Würfe in der Reihenfolge, die das Tablet lokal berechnet: A, B, A.
        var turns = new[] { (f.PlayerIds[0], 0, 81), (f.PlayerIds[1], 0, 60), (f.PlayerIds[0], 1, 100) };
        foreach (var (player, round, score) in turns)
            Assert.Equal(HttpStatusCode.OK, (await Submit(f, player, score, Guid.NewGuid(), round)).StatusCode);

        Assert.Equal([81, 100], await ScoresOf(f, f.PlayerIds[0]));
        Assert.Equal([60], await ScoresOf(f, f.PlayerIds[1]));
    }

    [Fact]
    public async Task Nicht_dran_wird_mit_Code_abgelehnt()
    {
        var f = await app.SeedGameAsync();

        var response = await Submit(f, f.PlayerIds[1], 50, Guid.NewGuid(), roundIndex: 0);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(TurnRejectionCodes.NotYourTurn, (await Rejection(response)).Code);
        Assert.Empty(await ScoresOf(f, f.PlayerIds[1]));
    }

    [Fact]
    public async Task Schon_belegte_Aufnahme_wird_mit_Code_abgelehnt()
    {
        var f = await app.SeedGameAsync(playerCount: 1);
        await Submit(f, f.PlayerIds[0], 20, Guid.NewGuid(), roundIndex: 0);

        // Neue Kennung, aber dieselbe Aufnahme - z. B. von einem zweiten Gerät doppelt eingegeben.
        var response = await Submit(f, f.PlayerIds[0], 20, Guid.NewGuid(), roundIndex: 0);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(TurnRejectionCodes.RoundAlreadyRecorded, (await Rejection(response)).Code);
        Assert.Equal([20], await ScoresOf(f, f.PlayerIds[0]));
    }

    [Fact]
    public async Task Beendetes_Spiel_wird_mit_Code_abgelehnt()
    {
        var f = await app.SeedGameAsync(playerCount: 1, rounds: 1);
        await Submit(f, f.PlayerIds[0], 20, Guid.NewGuid(), roundIndex: 0);

        var response = await Submit(f, f.PlayerIds[0], 20, Guid.NewGuid(), roundIndex: 1);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(TurnRejectionCodes.GameFinished, (await Rejection(response)).Code);
    }

    [Fact]
    public async Task Unbekanntes_Spiel_wird_mit_Code_abgelehnt()
    {
        var f = await app.SeedGameAsync();

        var response = await Submit(f, f.PlayerIds[0], 20, Guid.NewGuid(), roundIndex: 0, gameId: Guid.NewGuid());

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(TurnRejectionCodes.GameNotFound, (await Rejection(response)).Code);
    }

    [Fact]
    public async Task Ungueltige_Punktzahl_wird_mit_Code_abgelehnt()
    {
        var f = await app.SeedGameAsync();

        var response = await Submit(f, f.PlayerIds[0], 181, Guid.NewGuid(), roundIndex: 0);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(TurnRejectionCodes.InvalidScore, (await Rejection(response)).Code);
    }

    [Fact]
    public async Task Alter_Aufruf_ohne_Kennung_funktioniert_weiter()
    {
        var f = await app.SeedGameAsync();

        var response = await _client.PostAsJsonAsync(f.TurnsUrl, new { playerId = f.PlayerIds[0], score = 33 });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal([33], await ScoresOf(f, f.PlayerIds[0]));
    }

    [Fact]
    public async Task Wurf_speichert_Board_und_Empfangszeit()
    {
        var f = await app.SeedGameAsync();
        var turnId = Guid.NewGuid();
        var before = DateTime.UtcNow.AddSeconds(-1);

        await Submit(f, f.PlayerIds[0], 180, turnId, roundIndex: 0);

        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<DartsDbContext>();
        var submission = await db.TurnSubmissions.SingleAsync(t => t.ClientTurnId == turnId);
        Assert.Equal(f.BoardId, submission.BoardId);
        Assert.Equal(0, submission.RoundIndex);
        Assert.True(submission.ReceivedAt >= before);
    }
}
