namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// A single player's scores within a <see cref="Game"/>.
/// Scores are turn totals (3-dart sums), not per-dart values (see open question in the project plan).
/// </summary>
public class GameEntry
{
    public Guid Id { get; private set; }

    public Guid PlayerId { get; private set; }

    /// <summary>
    /// Position in the fixed throwing rotation (see Game.CurrentTurnPlayerId).
    /// Persisted explicitly because EF Core does not guarantee that an owned
    /// collection reloads in insertion order - relying on in-memory list
    /// order alone silently breaks the rotation across a save/reload.
    /// </summary>
    public int TurnOrder { get; private set; }

    private readonly List<int> _roundScores = [];
    public IReadOnlyList<int> RoundScores => _roundScores;

    public int Total => _roundScores.Sum();

    private GameEntry()
    {
    }

    public GameEntry(Guid playerId, int turnOrder)
    {
        Id = Guid.NewGuid();
        PlayerId = playerId;
        TurnOrder = turnOrder;
    }

    public void RecordScore(int score)
    {
        if (score is < 0 or > 180)
            throw new ArgumentException("Score must be between 0 and 180.", nameof(score));

        _roundScores.Add(score);
    }

    /// <summary>
    /// Removes this player's most recently recorded score ("Wurf-Korrektur",
    /// project plan 3.1) - a mis-entered value can be undone and re-entered
    /// rather than requiring the whole game to be scrapped.
    /// </summary>
    public void RemoveLastScore()
    {
        if (_roundScores.Count == 0)
            throw new InvalidOperationException("This player has no recorded scores to remove.");

        _roundScores.RemoveAt(_roundScores.Count - 1);
    }

    /// <summary>
    /// Clears every recorded score for this player only ("Wurf-Korrektur" on
    /// the player level - the old system's four correction levels included
    /// resetting a single player without touching the others).
    /// </summary>
    public void ClearScores() => _roundScores.Clear();

    /// <summary>
    /// Overwrites one already-recorded throw in place, rather than just the
    /// latest one - matches the old system's per-throw edit screen, where
    /// the scorer can fix a mis-entered value from several turns back
    /// without undoing everything thrown since.
    /// </summary>
    public void SetScoreAt(int index, int score)
    {
        if (index < 0 || index >= _roundScores.Count)
            throw new ArgumentOutOfRangeException(nameof(index));

        if (score is < 0 or > 180)
            throw new ArgumentException("Score must be between 0 and 180.", nameof(score));

        _roundScores[index] = score;
    }
}
