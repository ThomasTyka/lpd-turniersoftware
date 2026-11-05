using System.Text.RegularExpressions;
using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Represents a darts event that can contain tournaments, boards, devices,
/// branding information and event-specific configuration.
/// </summary>
public partial class Event
{
    public Guid Id { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string CustomerName { get; private set; } = string.Empty;

    public DateTime EventDate { get; private set; }

    public string Location { get; private set; } = string.Empty;

    public EventStatus Status { get; private set; }

    /// <summary>
    /// Planned number of boards for this event. A planning figure,
    /// independent of the boards actually added.
    /// </summary>
    public int? PlannedBoardCount { get; private set; }

    /// <summary>
    /// Primary customer brand color as a 6-digit hex code (e.g. "#AA3BFF").
    /// </summary>
    public string? PrimaryColor { get; private set; }

    /// <summary>
    /// Secondary customer brand color as a 6-digit hex code.
    /// </summary>
    public string? SecondaryColor { get; private set; }

    /// <summary>
    /// Path to the uploaded customer logo, relative to the configured upload storage.
    /// </summary>
    public string? LogoPath { get; private set; }

    private readonly List<Player> _players = [];
    public IReadOnlyCollection<Player> Players => _players;

    private readonly List<Tournament> _tournaments = [];
    public IReadOnlyCollection<Tournament> Tournaments => _tournaments;

    private readonly List<Board> _boards = [];
    public IReadOnlyCollection<Board> Boards => _boards;

    private readonly List<Team> _teams = [];
    public IReadOnlyCollection<Team> Teams => _teams;

    private Event()
    {
    }

    /// <summary>
    /// Creates a new darts event in draft status.
    /// </summary>
    /// <param name="name">The event name.</param>
    /// <param name="customerName">The customer name.</param>
    /// <param name="eventDate">The date of the event.</param>
    /// <param name="location">The event location.</param>
    /// <param name="plannedBoardCount">Optional planned number of boards.</param>
    /// <exception cref="ArgumentException">
    /// Thrown when required event information is missing.
    /// </exception>
    public Event(string name, string customerName, DateTime eventDate, string location, int? plannedBoardCount = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Event name must not be empty.", nameof(name));

        if (string.IsNullOrWhiteSpace(customerName))
            throw new ArgumentException("Customer name must not be empty.", nameof(customerName));

        if (string.IsNullOrWhiteSpace(location))
            throw new ArgumentException("Location must not be empty.", nameof(location));

        if (plannedBoardCount is <= 0)
            throw new ArgumentException("Planned board count must be positive.", nameof(plannedBoardCount));

        Id = Guid.NewGuid();
        Name = name;
        CustomerName = customerName;
        EventDate = eventDate;
        Location = location;
        PlannedBoardCount = plannedBoardCount;
        Status = EventStatus.Draft;
    }

    /// <summary>
    /// Updates the event's core details ("Event bearbeiten") - the same
    /// fields set at creation time.
    /// </summary>
    public void Edit(string name, string customerName, DateTime eventDate, string location)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Event name must not be empty.", nameof(name));

        if (string.IsNullOrWhiteSpace(customerName))
            throw new ArgumentException("Customer name must not be empty.", nameof(customerName));

        if (string.IsNullOrWhiteSpace(location))
            throw new ArgumentException("Location must not be empty.", nameof(location));

        Name = name;
        CustomerName = customerName;
        EventDate = eventDate;
        Location = location;
    }

    public void AddPlayer(Player player)
    {
        if (player is null)
            throw new ArgumentNullException(nameof(player));

        EnsureUniqueName(player.FirstName, player.LastName, excludingPlayerId: null);
        _players.Add(player);
    }

    /// <summary>
    /// Renames an existing player, rejecting a rename that would collide
    /// with another player's first/last name within this event (see
    /// EnsureUniqueName).
    /// </summary>
    public void RenamePlayer(Guid playerId, string firstName, string lastName, string? nickname = null)
    {
        var player = _players.FirstOrDefault(p => p.Id == playerId)
            ?? throw new InvalidOperationException("Player not found in this event.");

        EnsureUniqueName(firstName, lastName, excludingPlayerId: playerId);
        player.Rename(firstName, lastName, nickname);
    }

    /// <summary>
    /// First/last name must be unique within an event ("Pro Event muss
    /// Vor- und Nachname eindeutig sein") - checked on the raw name parts,
    /// not the resolved display name, so a nickname can't be used to sneak
    /// in a second entry for what is otherwise the same name.
    /// </summary>
    private void EnsureUniqueName(string firstName, string lastName, Guid? excludingPlayerId)
    {
        var isDuplicate = _players.Any(p =>
            p.Id != excludingPlayerId
            && string.Equals(p.FirstName, firstName, StringComparison.OrdinalIgnoreCase)
            && string.Equals(p.LastName, lastName, StringComparison.OrdinalIgnoreCase));

        if (isDuplicate)
            throw new ArgumentException("Dieser Spieler ist bereits in der Liste dieses Events vorhanden.");
    }

    public void RemovePlayer(Player player) => _players.Remove(player);

    public void AddTournament(Tournament tournament) => _tournaments.Add(tournament ?? throw new ArgumentNullException(nameof(tournament)));

    public void RemoveTournament(Tournament tournament) => _tournaments.Remove(tournament);

    public void AddBoard(Board board) => _boards.Add(board ?? throw new ArgumentNullException(nameof(board)));

    public void RemoveBoard(Board board) => _boards.Remove(board);

    public void AddTeam(Team team) => _teams.Add(team ?? throw new ArgumentNullException(nameof(team)));

    public void RemoveTeam(Team team) => _teams.Remove(team);

    public void SetPlannedBoardCount(int? plannedBoardCount)
    {
        if (plannedBoardCount is <= 0)
            throw new ArgumentException("Planned board count must be positive.", nameof(plannedBoardCount));

        PlannedBoardCount = plannedBoardCount;
    }

    public void SetBranding(string? primaryColor, string? secondaryColor)
    {
        if (primaryColor is not null && !HexColorRegex().IsMatch(primaryColor))
            throw new ArgumentException("Primary color must be a 6-digit hex code, e.g. #AA3BFF.", nameof(primaryColor));

        if (secondaryColor is not null && !HexColorRegex().IsMatch(secondaryColor))
            throw new ArgumentException("Secondary color must be a 6-digit hex code, e.g. #AA3BFF.", nameof(secondaryColor));

        PrimaryColor = primaryColor;
        SecondaryColor = secondaryColor;
    }

    public void SetLogoPath(string logoPath)
    {
        if (string.IsNullOrWhiteSpace(logoPath))
            throw new ArgumentException("Logo path must not be empty.", nameof(logoPath));

        LogoPath = logoPath;
    }

    /// <summary>
    /// Sets the event status directly, to any value, regardless of the
    /// current status - mirrors the old system's updateEvent(id, {status})
    /// (a plain field write, no server-side validation). Replaces the
    /// former guarded Activate/Archive/Unarchive transitions.
    /// </summary>
    public void SetStatus(EventStatus status)
    {
        Status = status;
    }

    [GeneratedRegex("^#[0-9A-Fa-f]{6}$")]
    private static partial Regex HexColorRegex();
}
