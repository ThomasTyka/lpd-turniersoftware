namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// One group within a group-stage round: a fixed set of participants play a
/// single shared Highscore game (see Game.GroupRoundId), and the top
/// AdvanceCount by score advance to the next phase - matching how the old
/// Tournament-Manager's "numberOfWinners per game" round type worked, minus
/// the Best-of-Legs concept (that's what KnockoutMatch is for).
/// </summary>
public class GroupRound
{
    public Guid Id { get; private set; }

    public Guid TournamentId { get; private set; }

    /// <summary>1-based round number within the group stage.</summary>
    public int Round { get; private set; }

    /// <summary>0-based position within the round.</summary>
    public int Position { get; private set; }

    /// <summary>How many of this group's participants advance (top-N by score).</summary>
    public int AdvanceCount { get; private set; }

    private readonly List<Guid> _participantIds = [];
    public IReadOnlyList<Guid> ParticipantIds => _participantIds;

    private readonly List<Guid> _advancingPlayerIds = [];
    public IReadOnlyList<Guid> AdvancingPlayerIds => _advancingPlayerIds;

    public bool IsDecided => _advancingPlayerIds.Count > 0;

    private GroupRound()
    {
    }

    public GroupRound(Guid tournamentId, int round, int position, int advanceCount, IEnumerable<Guid> participantIds)
    {
        if (round <= 0)
            throw new ArgumentException("Round must be positive.", nameof(round));

        if (position < 0)
            throw new ArgumentException("Position cannot be negative.", nameof(position));

        var ids = participantIds.ToList();
        if (ids.Distinct().Count() != ids.Count)
            throw new ArgumentException("A participant cannot appear twice in the same group.", nameof(participantIds));

        if (advanceCount <= 0 || advanceCount >= ids.Count)
            throw new ArgumentException("AdvanceCount must be positive and less than the number of participants.", nameof(advanceCount));

        Id = Guid.NewGuid();
        TournamentId = tournamentId;
        Round = round;
        Position = position;
        AdvanceCount = advanceCount;
        _participantIds = ids;
    }

    /// <summary>
    /// Tries to auto-decide advancement from final standings (highest total
    /// first). Returns false without deciding anything if there's a tie
    /// spanning the advancement cutoff - the caller must then use ResolveTie.
    /// Matches the old system's exact tie-detection: players scoring above
    /// the cutoff always advance; only ties AT the cutoff score are blocked.
    /// </summary>
    public bool TryApplyStandings(IReadOnlyList<(Guid PlayerId, int Total)> standingsDescending)
    {
        if (IsDecided)
            return true;

        if (standingsDescending.Count != ParticipantIds.Count)
            throw new ArgumentException("Standings must include every participant of this group.", nameof(standingsDescending));

        var cutoffScore = standingsDescending[AdvanceCount - 1].Total;
        var higherScorers = standingsDescending.Where(s => s.Total > cutoffScore).ToList();
        var atCutoffScore = standingsDescending.Where(s => s.Total == cutoffScore).ToList();
        var spotsRemaining = AdvanceCount - higherScorers.Count;

        if (atCutoffScore.Count > spotsRemaining)
            return false;

        _advancingPlayerIds.AddRange(higherScorers.Select(s => s.PlayerId));
        _advancingPlayerIds.AddRange(atCutoffScore.Take(spotsRemaining).Select(s => s.PlayerId));
        return true;
    }

    /// <summary>
    /// Manually resolves a boundary tie (see TryApplyStandings) by specifying
    /// exactly which players advance. Anyone who scored strictly above the
    /// cutoff must be included - this only lets the Regie choose among the
    /// players actually tied at the cutoff score.
    /// </summary>
    public void ResolveTie(IEnumerable<Guid> advancingPlayerIds, IReadOnlyList<(Guid PlayerId, int Total)> standingsDescending)
    {
        if (IsDecided)
            throw new InvalidOperationException("This group has already been decided.");

        var ids = advancingPlayerIds.Distinct().ToList();
        if (ids.Count != AdvanceCount)
            throw new ArgumentException($"Exactly {AdvanceCount} players must advance.", nameof(advancingPlayerIds));

        if (ids.Any(id => !ParticipantIds.Contains(id)))
            throw new ArgumentException("All advancing players must be participants of this group.", nameof(advancingPlayerIds));

        var cutoffScore = standingsDescending[AdvanceCount - 1].Total;
        var mustAdvance = standingsDescending.Where(s => s.Total > cutoffScore).Select(s => s.PlayerId);
        if (mustAdvance.Any(id => !ids.Contains(id)))
            throw new ArgumentException("Players who scored higher than the tied group must be included.", nameof(advancingPlayerIds));

        _advancingPlayerIds.AddRange(ids);
    }

    /// <summary>
    /// Replaces a participant who's missing (e.g. absent for this group
    /// stage) with a substitute - manual only, mirroring
    /// KnockoutMatch.SubstitutePlayer. Only allowed before this group's
    /// shared game has started. Callers are expected to also verify that
    /// (see GroupEndpoints for the eligible-substitute-pool check).
    /// </summary>
    public void SubstituteParticipant(Guid outgoingPlayerId, Guid incomingPlayerId)
    {
        if (IsDecided)
            throw new InvalidOperationException("Cannot substitute a participant in a group that has already been decided.");

        var index = _participantIds.IndexOf(outgoingPlayerId);
        if (index < 0)
            throw new ArgumentException("The outgoing player is not a participant of this group.", nameof(outgoingPlayerId));

        if (_participantIds.Contains(incomingPlayerId))
            throw new ArgumentException("The incoming player is already a participant of this group.", nameof(incomingPlayerId));

        _participantIds[index] = incomingPlayerId;
    }
}
