using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Represents a dartboard set up at an event.
/// </summary>
public class Board
{
    public Guid Id { get; private set; }

    public int Number { get; private set; }

    /// <summary>
    /// Freely chosen display name (e.g. "Bullseye-Bar"), shown instead of
    /// the plain number wherever possible.
    /// </summary>
    public string? Name { get; private set; }

    public string? LocationDescription { get; private set; }

    public BoardStatus Status { get; private set; }

    private Board()
    {
    }

    /// <summary>
    /// Creates a new board.
    /// </summary>
    /// <param name="number">The board number, must be positive.</param>
    /// <param name="locationDescription">An optional description of where the board is set up.</param>
    /// <param name="name">An optional freely chosen display name.</param>
    /// <exception cref="ArgumentException">
    /// Thrown when the board number is not positive.
    /// </exception>
    public Board(int number, string? locationDescription = null, string? name = null)
    {
        if (number <= 0)
            throw new ArgumentException("Board number must be positive.", nameof(number));

        Id = Guid.NewGuid();
        Number = number;
        LocationDescription = locationDescription;
        Name = name;
        Status = BoardStatus.Available;
    }

    public void Rename(string? name) => Name = name;
}
