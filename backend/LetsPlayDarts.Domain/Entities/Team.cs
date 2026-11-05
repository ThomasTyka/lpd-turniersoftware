namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// A named group of players competing together, scoped to a single event
/// (see ADR-005, same as Player). Matches the old Tournament-Manager's Team
/// model: teams don't play as a single unit at the throw level - each
/// member still throws individually (see GameEntry) - a team's score for a
/// game is the sum of its members' totals in that game (see
/// TournamentEndpoints' team-leaderboard).
/// </summary>
public class Team
{
    public Guid Id { get; private set; }

    public string Name { get; private set; } = string.Empty;

    private readonly List<Guid> _playerIds = [];
    public IReadOnlyList<Guid> PlayerIds => _playerIds;

    private Team()
    {
    }

    public Team(string name, IEnumerable<Guid> playerIds)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Team name must not be empty.", nameof(name));

        var ids = playerIds.ToList();
        if (ids.Count == 0)
            throw new ArgumentException("A team needs at least one player.", nameof(playerIds));

        if (ids.Distinct().Count() != ids.Count)
            throw new ArgumentException("A player cannot appear twice on the same team.", nameof(playerIds));

        Id = Guid.NewGuid();
        Name = name;
        _playerIds = ids;
    }

    public void Rename(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Team name must not be empty.", nameof(name));

        Name = name;
    }

    public void AddPlayer(Guid playerId)
    {
        if (_playerIds.Contains(playerId))
            throw new ArgumentException("This player is already on the team.", nameof(playerId));

        _playerIds.Add(playerId);
    }

    public void RemovePlayer(Guid playerId)
    {
        if (_playerIds.Count <= 1)
            throw new InvalidOperationException("A team needs at least one player.");

        if (!_playerIds.Remove(playerId))
            throw new ArgumentException("This player is not on the team.", nameof(playerId));
    }
}
