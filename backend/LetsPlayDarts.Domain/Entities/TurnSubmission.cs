namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Protokoll eines vom Tablet gesendeten Wurfs (E-17). Die Kennung
/// (<see cref="ClientTurnId"/>) erzeugt das Tablet beim Eintragen; kommt
/// derselbe Wurf ein zweites Mal an (z. B. weil die Antwort des Servers
/// verloren ging und das Tablet erneut sendet), erkennt der Server ihn daran
/// und zählt ihn nicht doppelt.
///
/// Speichert zusätzlich Board und Empfangszeit jeder Aufnahme - Grundlage
/// für P6-14 (180er-Liste mit Board und Uhrzeit), in Paket 1 noch ohne
/// Anzeige.
/// </summary>
public class TurnSubmission
{
    public Guid ClientTurnId { get; private set; }

    public Guid GameId { get; private set; }

    public Guid PlayerId { get; private set; }

    public Guid BoardId { get; private set; }

    public Guid ClientDeviceId { get; private set; }

    /// <summary>0-basierte Aufnahme-Nummer des Spielers in diesem Spiel.</summary>
    public int RoundIndex { get; private set; }

    public int Score { get; private set; }

    public DateTime ReceivedAt { get; private set; }

    private TurnSubmission()
    {
    }

    public TurnSubmission(Guid clientTurnId, Guid gameId, Guid playerId, Guid boardId, Guid clientDeviceId, int roundIndex, int score)
    {
        if (clientTurnId == Guid.Empty)
            throw new ArgumentException("Die Wurf-Kennung darf nicht leer sein.", nameof(clientTurnId));

        ClientTurnId = clientTurnId;
        GameId = gameId;
        PlayerId = playerId;
        BoardId = boardId;
        ClientDeviceId = clientDeviceId;
        RoundIndex = roundIndex;
        Score = score;
        ReceivedAt = DateTime.UtcNow;
    }
}
