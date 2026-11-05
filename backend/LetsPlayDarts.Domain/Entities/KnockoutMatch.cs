namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// One matchup in the knockout bracket (project plan Abschnitt 2: "KO-Runden
/// (Sechzehntel- bis Finale) mit automatischer Paarungsbildung inkl.
/// Setzliste, Best-of-X-Legs und Spiel um Platz 3"). A match is decided once
/// one player has won the majority of the best-of-N legs, where each leg is
/// a separate Game between the two players. A match with only one player set
/// is a bye and is decided immediately.
/// </summary>
public class KnockoutMatch
{
    public Guid Id { get; private set; }

    public Guid TournamentId { get; private set; }

    /// <summary>1-based round number within the KO stage.</summary>
    public int Round { get; private set; }

    /// <summary>0-based position within the round, used to pair winners into the next round.</summary>
    public int Position { get; private set; }

    /// <summary>Number of legs (Games) needed to win the match, e.g. 3 for "best of 3".</summary>
    public int BestOfLegs { get; private set; }

    public Guid? Player1Id { get; private set; }

    public Guid? Player2Id { get; private set; }

    public Guid? WinnerId { get; private set; }

    /// <summary>
    /// The extra match between the two semifinal losers ("Spiel um Platz
    /// 3"), not part of the normal bracket progression.
    /// </summary>
    public bool IsThirdPlaceMatch { get; private set; }

    private KnockoutMatch()
    {
    }

    public KnockoutMatch(Guid tournamentId, int round, int position, int bestOfLegs, Guid? player1Id, Guid? player2Id, bool isThirdPlaceMatch = false)
    {
        if (round <= 0)
            throw new ArgumentException("Round must be positive.", nameof(round));

        if (position < 0)
            throw new ArgumentException("Position cannot be negative.", nameof(position));

        if (bestOfLegs <= 0 || bestOfLegs % 2 == 0)
            throw new ArgumentException("BestOfLegs must be a positive odd number.", nameof(bestOfLegs));

        if (player1Id is not null && player2Id is not null && player1Id == player2Id)
            throw new ArgumentException("A match needs two distinct players.", nameof(player2Id));

        Id = Guid.NewGuid();
        TournamentId = tournamentId;
        Round = round;
        Position = position;
        BestOfLegs = bestOfLegs;
        Player1Id = player1Id;
        Player2Id = player2Id;
        IsThirdPlaceMatch = isThirdPlaceMatch;

        // A bye (only one side set) advances immediately without playing a leg.
        if (player1Id is not null && player2Id is null)
            WinnerId = player1Id;
        else if (player2Id is not null && player1Id is null)
            WinnerId = player2Id;
    }

    public int LegsToWin => BestOfLegs / 2 + 1;

    /// <summary>
    /// Recomputes the winner from the legs played so far. Called after a leg
    /// (Game) linked to this match finishes. A no-op once the match is
    /// already decided or if the match is still waiting for a bye/opponent.
    /// </summary>
    public void ApplyLegResults(int player1Wins, int player2Wins)
    {
        if (WinnerId is not null || Player1Id is null || Player2Id is null)
            return;

        if (player1Wins >= LegsToWin)
            WinnerId = Player1Id;
        else if (player2Wins >= LegsToWin)
            WinnerId = Player2Id;
    }

    /// <summary>
    /// Replaces a player who can no longer continue with a substitute (e.g.
    /// injury/withdrawal mid-tournament). Only allowed before this match is
    /// decided - the match the outgoing player already won stays untouched,
    /// this only changes who represents that bracket slot going forward.
    /// Callers are expected to also verify no legs have been played yet for
    /// this match and that the incoming player is actually available (see
    /// KnockoutEndpoints for the eliminated-player-pool check), since both
    /// checks require looking beyond this single match.
    /// </summary>
    public void SubstitutePlayer(Guid outgoingPlayerId, Guid incomingPlayerId)
    {
        if (WinnerId is not null)
            throw new InvalidOperationException("Cannot substitute a player in a match that has already been decided.");

        if (Player1Id == outgoingPlayerId)
            Player1Id = incomingPlayerId;
        else if (Player2Id == outgoingPlayerId)
            Player2Id = incomingPlayerId;
        else
            throw new ArgumentException("The outgoing player is not part of this match.", nameof(outgoingPlayerId));

        if (Player1Id == Player2Id)
            throw new ArgumentException("A match needs two distinct players.", nameof(incomingPlayerId));
    }
}
