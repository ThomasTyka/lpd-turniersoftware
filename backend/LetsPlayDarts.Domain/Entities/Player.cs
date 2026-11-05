namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Represents a player taking part in an event.
/// A player is scoped to a single event (see ADR-005) and is not a reusable global profile.
/// </summary>
public class Player
{
    public Guid Id { get; private set; }

    public string FirstName { get; private set; } = string.Empty;

    public string LastName { get; private set; } = string.Empty;

    public string? Nickname { get; private set; }

    /// <summary>
    /// The name shown on tablets, board monitors and the canvas.
    /// Falls back to "FirstName LastName" when no nickname is set.
    /// </summary>
    public string DisplayName { get; private set; } = string.Empty;

    private Player()
    {
    }

    /// <summary>
    /// Creates a new player.
    /// </summary>
    /// <param name="firstName">The player's first name.</param>
    /// <param name="lastName">The player's last name.</param>
    /// <param name="nickname">An optional nickname, used as display name when set.</param>
    /// <exception cref="ArgumentException">
    /// Thrown when required player information is missing.
    /// </exception>
    public Player(string firstName, string lastName, string? nickname = null)
    {
        if (string.IsNullOrWhiteSpace(firstName))
            throw new ArgumentException("First name must not be empty.", nameof(firstName));

        if (string.IsNullOrWhiteSpace(lastName))
            throw new ArgumentException("Last name must not be empty.", nameof(lastName));

        Id = Guid.NewGuid();
        FirstName = firstName;
        LastName = lastName;
        Nickname = nickname;
        DisplayName = string.IsNullOrWhiteSpace(nickname) ? $"{firstName} {lastName}" : nickname;
    }

    /// <summary>
    /// Updates this player's name details ("Spieler bearbeiten").
    /// </summary>
    public void Rename(string firstName, string lastName, string? nickname = null)
    {
        if (string.IsNullOrWhiteSpace(firstName))
            throw new ArgumentException("First name must not be empty.", nameof(firstName));

        if (string.IsNullOrWhiteSpace(lastName))
            throw new ArgumentException("Last name must not be empty.", nameof(lastName));

        FirstName = firstName;
        LastName = lastName;
        Nickname = nickname;
        DisplayName = string.IsNullOrWhiteSpace(nickname) ? $"{firstName} {lastName}" : nickname;
    }
}
