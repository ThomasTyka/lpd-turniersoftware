using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// A single game within a tournament, in one of two modes: Highscore (each
/// player throws a fixed number of rounds, the highest total wins) or X01
/// (each player starts at a fixed score and counts down to exactly zero,
/// first there wins).
/// </summary>
public class Game
{
    public Guid Id { get; private set; }

    public Guid TournamentId { get; private set; }

    /// <summary>
    /// The board this game is played on. A board monitor watches this to
    /// know which game to display (see project plan 3.1/3.2).
    /// </summary>
    public Guid BoardId { get; private set; }

    public GameMode Mode { get; private set; }

    /// <summary>
    /// Number of rounds for Highscore, snapshotted from the tournament's game
    /// settings at creation time so the game stays consistent even if settings
    /// change later. Null for X01, which has no fixed round count.
    /// </summary>
    public int? Rounds { get; private set; }

    /// <summary>
    /// Starting score for X01 (301 or 501), snapshotted at creation time.
    /// Null for Highscore.
    /// </summary>
    public int? StartScore { get; private set; }

    public GameStatus Status { get; private set; }

    public DateTime StartedAt { get; private set; }

    /// <summary>
    /// Set when this game is one leg of a knockout match (see KnockoutMatch),
    /// null for ordinary qualification games.
    /// </summary>
    public Guid? KnockoutMatchId { get; private set; }

    /// <summary>
    /// Set when this game is the shared game of a group-stage round (see
    /// GroupRound), null otherwise. Mutually exclusive with KnockoutMatchId.
    /// </summary>
    public Guid? GroupRoundId { get; private set; }

    /// <summary>
    /// Manually chosen winner for a knockout leg that finished tied (equal
    /// Total) - a real tie has no correct answer from the scores alone, so
    /// (unlike the old system's "Gleiche Punktzahl!" tablet dialog for any
    /// tied game) the Tablet is asked to pick one, scoped for now to
    /// knockout legs specifically, where a winner is required for the match
    /// to progress. Null otherwise, including for a decisive (non-tied) game.
    /// </summary>
    public Guid? TiebreakWinnerId { get; private set; }

    private readonly List<GameEntry> _entries = [];
    public IReadOnlyCollection<GameEntry> Entries => _entries;

    private Game()
    {
    }

    /// <summary>
    /// Creates a new game for the given players. Exactly one of
    /// <paramref name="rounds"/> (Highscore) or <paramref name="startScore"/>
    /// (X01) must be set, matching <paramref name="mode"/> - mirrors the
    /// validation already done once at the tournament-settings level
    /// (GameSettings), repeated here since Game is constructed independently.
    /// </summary>
    public Game(Guid tournamentId, Guid boardId, GameMode mode, int? rounds, int? startScore, IEnumerable<Guid> playerIds, Guid? knockoutMatchId = null, Guid? groupRoundId = null)
    {
        if (mode == GameMode.Highscore && rounds is not (> 0))
            throw new ArgumentException("Rounds must be positive for Highscore.", nameof(rounds));

        if (mode == GameMode.Highscore && startScore is not null)
            throw new ArgumentException("Highscore must not define a start score.", nameof(startScore));

        if (mode == GameMode.X01 && startScore is null)
            throw new ArgumentException("X01 requires a start score.", nameof(startScore));

        if (mode == GameMode.X01 && rounds is not null)
            throw new ArgumentException("X01 must not define a round count.", nameof(rounds));

        var ids = playerIds.ToList();
        if (ids.Count == 0)
            throw new ArgumentException("A game needs at least one player.", nameof(playerIds));

        if (ids.Distinct().Count() != ids.Count)
            throw new ArgumentException("A player cannot appear twice in the same game.", nameof(playerIds));

        Id = Guid.NewGuid();
        TournamentId = tournamentId;
        BoardId = boardId;
        Mode = mode;
        Rounds = rounds;
        StartScore = startScore;
        Status = GameStatus.InProgress;
        StartedAt = DateTime.UtcNow;
        KnockoutMatchId = knockoutMatchId;
        GroupRoundId = groupRoundId;

        for (var i = 0; i < ids.Count; i++)
            _entries.Add(new GameEntry(ids[i], i));
    }

    /// <summary>
    /// Whose turn it is: players throw in a fixed rotation (GameEntry.TurnOrder,
    /// set at creation time), one round each before the rotation repeats - the
    /// way a real Highscore game is actually played, not free-for-all entry.
    /// The player with the fewest recorded rounds so far is next; ties
    /// (nobody has thrown this round yet) go to whoever comes first in that
    /// rotation. TurnOrder is used rather than in-memory list order because
    /// EF Core does not guarantee an owned collection reloads in insertion
    /// order. Null once the game is no longer in progress.
    /// </summary>
    public Guid? CurrentTurnPlayerId
    {
        get
        {
            if (Status != GameStatus.InProgress)
                return null;

            return _entries
                .OrderBy(e => e.RoundScores.Count)
                .ThenBy(e => e.TurnOrder)
                .First()
                .PlayerId;
        }
    }

    /// <summary>
    /// Records one turn (3-dart sum) for a player. Must be that player's
    /// turn (see CurrentTurnPlayerId) - players alternate, they can't throw
    /// twice in a row while someone else is still waiting on their round.
    /// Highscore finishes once every player has recorded all rounds. X01
    /// finishes the moment a player's remaining score hits exactly zero; a
    /// throw that would take it below zero is a bust and rejected outright
    /// (mirrors the old system: the scorer re-enters rather than the turn
    /// silently passing with the throw zeroed out).
    /// </summary>
    public void RecordTurn(Guid playerId, int score)
    {
        if (Status != GameStatus.InProgress)
            throw new InvalidOperationException($"Cannot record a turn for a game in status {Status}.");

        var entry = _entries.FirstOrDefault(e => e.PlayerId == playerId)
            ?? throw new ArgumentException("This player is not part of the game.", nameof(playerId));

        if (playerId != CurrentTurnPlayerId)
            throw new InvalidOperationException("It is not this player's turn yet.");

        if (Mode == GameMode.X01 && score > StartScore!.Value - entry.Total)
            throw new ArgumentException("Bust: der Wurf ist höher als der verbleibende Rest.", nameof(score));

        entry.RecordScore(score);

        if (Mode == GameMode.Highscore)
        {
            if (_entries.All(e => e.RoundScores.Count == Rounds!.Value))
                Status = GameStatus.Finished;
        }
        else if (StartScore!.Value - entry.Total == 0)
        {
            Status = GameStatus.Finished;
        }
    }

    /// <summary>
    /// Undoes a player's most recently recorded turn ("Wurf-Korrektur",
    /// project plan 3.1). Re-opens the game if it had just finished, since
    /// it's no longer true that every player has recorded all rounds.
    /// </summary>
    public void RemoveLastTurn(Guid playerId)
    {
        var entry = _entries.FirstOrDefault(e => e.PlayerId == playerId)
            ?? throw new ArgumentException("This player is not part of the game.", nameof(playerId));

        entry.RemoveLastScore();

        if (Status == GameStatus.Finished)
            Status = GameStatus.InProgress;
    }

    /// <summary>
    /// Overwrites one of a player's already-recorded throws in place, not
    /// just the latest one ("Wurf-Korrektur" on an arbitrary past throw -
    /// matches the old system's per-throw edit screen). Only checks that
    /// the edited total still fits the start score for X01 - it does not
    /// re-validate every throw since as a bust sequence, same trade-off as
    /// ChangeBoard's doc comment on not replicating the old system's full
    /// after-the-fact rewrite. Reopens the game if it had finished, same as
    /// RemoveLastTurn, since the edit can change whether it still has.
    /// </summary>
    public void SetPlayerThrow(Guid playerId, int throwIndex, int score)
    {
        var entry = _entries.FirstOrDefault(e => e.PlayerId == playerId)
            ?? throw new ArgumentException("This player is not part of the game.", nameof(playerId));

        if (throwIndex < 0 || throwIndex >= entry.RoundScores.Count)
            throw new ArgumentOutOfRangeException(nameof(throwIndex));

        if (Mode == GameMode.X01)
        {
            var prospectiveTotal = entry.Total - entry.RoundScores[throwIndex] + score;
            if (prospectiveTotal > StartScore!.Value)
                throw new ArgumentException("Der Gesamtwurf würde den Startwert überschreiten.", nameof(score));
        }

        entry.SetScoreAt(throwIndex, score);

        if (Status == GameStatus.Finished)
            Status = GameStatus.InProgress;

        if (Mode == GameMode.Highscore)
        {
            if (_entries.All(e => e.RoundScores.Count == Rounds!.Value))
                Status = GameStatus.Finished;
        }
        else if (StartScore!.Value - entry.Total == 0)
        {
            Status = GameStatus.Finished;
        }
    }

    /// <summary>
    /// Reassigns this game to a different board - only allowed before any
    /// throw has been recorded, e.g. to correct a mis-click when starting
    /// the game. A stripped-down version of the old system's full "edit a
    /// running game" (which also allowed changing mode/rounds/participants
    /// after throws existed) - deliberately not replicated as-is, since our
    /// stricter turn-order/bust rules make an after-the-fact rewrite risky.
    /// </summary>
    public void ChangeBoard(Guid boardId)
    {
        if (_entries.Any(e => e.RoundScores.Count > 0))
            throw new InvalidOperationException("Cannot change the board once a throw has been recorded.");

        BoardId = boardId;
    }

    /// <summary>
    /// Clears every throw for a single player ("Wurf-Korrektur" on the
    /// player level, project plan / old system had four correction levels -
    /// round, player, and a global "all throws" reset in addition to the
    /// single-throw undo above).
    /// </summary>
    public void RemoveAllTurnsForPlayer(Guid playerId)
    {
        var entry = _entries.FirstOrDefault(e => e.PlayerId == playerId)
            ?? throw new ArgumentException("This player is not part of the game.", nameof(playerId));

        entry.ClearScores();

        if (Status == GameStatus.Finished)
            Status = GameStatus.InProgress;
    }

    /// <summary>
    /// Clears every throw for every player, restarting the game from
    /// scratch without recreating it (keeps the same Id/board/knockout or
    /// group linkage) - the global "Alle Würfe" correction level.
    /// </summary>
    public void ResetAllTurns()
    {
        foreach (var entry in _entries)
            entry.ClearScores();

        TiebreakWinnerId = null;

        if (Status == GameStatus.Finished)
            Status = GameStatus.InProgress;
    }

    /// <summary>
    /// Current standings: highest total first for Highscore, lowest
    /// remaining score first for X01 (closest to checkout leads).
    /// </summary>
    public IReadOnlyList<GameEntry> GetStandings() =>
        Mode == GameMode.Highscore
            ? _entries.OrderByDescending(e => e.Total).ToList()
            : _entries.OrderBy(e => StartScore!.Value - e.Total).ToList();

    /// <summary>
    /// True when the top of the standings is an exact tie - the case
    /// KnockoutMatch legs need a manual decision for (see TiebreakWinnerId),
    /// since GetStandings/WinnerOf can't derive a fair answer from the
    /// scores alone.
    /// </summary>
    public bool IsTied
    {
        get
        {
            var standings = GetStandings();
            if (Mode == GameMode.Highscore)
                return standings.Count >= 2 && standings[0].Total == standings[1].Total;

            // X01 can't tie: the game ends the instant one player hits
            // exactly zero, so a second player reaching zero in the same
            // state is impossible.
            return false;
        }
    }

    /// <summary>
    /// Manually resolves a tied knockout leg ("Gleiche Punktzahl!" on the
    /// Tablet, matching the old system - see TiebreakWinnerId). Only valid
    /// once the game has actually finished tied; the winner must be one of
    /// the tied entries, and a leg can only be resolved once.
    /// </summary>
    public void ResolveTie(Guid winnerId)
    {
        if (Status != GameStatus.Finished)
            throw new InvalidOperationException("Cannot resolve a tie before the game has finished.");

        if (!IsTied)
            throw new InvalidOperationException("This game did not end in a tie.");

        if (TiebreakWinnerId is not null)
            throw new InvalidOperationException("This tie has already been resolved.");

        if (_entries.All(e => e.PlayerId != winnerId))
            throw new ArgumentException("The chosen winner is not part of this game.", nameof(winnerId));

        TiebreakWinnerId = winnerId;
    }
}
