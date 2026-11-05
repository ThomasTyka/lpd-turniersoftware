using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Domain.ValueObjects;

/// <summary>
/// Represents the game configuration for a tournament phase,
/// such as qualification or final.
/// </summary>
public class GameSettings
{
    /// <summary>
    /// Gets the selected game mode.
    /// </summary>
    public GameMode Mode { get; private set; }

    /// <summary>
    /// Gets the start score for X01 games.
    /// For Highscore this value must be null.
    /// </summary>
    public int? StartScore { get; private set; }

    /// <summary>
    /// Gets the number of rounds for Highscore games.
    /// Must be null for X01.
    /// </summary>
    public int? Rounds { get; private set; }

    private GameSettings()
    {
    }

    /// <summary>
    /// Creates a new game configuration.
    /// </summary>
    /// <param name="mode">The selected game mode.</param>
    /// <param name="startScore">
    /// The start score for X01 (301 or 501).
    /// Must be null for Highscore.
    /// </param>
    /// <param name="rounds">
    /// The number of rounds for Highscore. Must be null for X01.
    /// </param>
    /// <exception cref="ArgumentException">
    /// Thrown when an invalid game configuration is provided.
    /// </exception>
    public GameSettings(GameMode mode, int? startScore = null, int? rounds = null)
    {
        Mode = mode;

        if (mode == GameMode.X01 && startScore is not 301 and not 501)
            throw new ArgumentException("For X01 only a start score of 301 or 501 is allowed.");

        if (mode == GameMode.Highscore && startScore is not null)
            throw new ArgumentException("Highscore must not define a start score.");

        if (mode == GameMode.X01 && rounds is not null)
            throw new ArgumentException("X01 must not define a round count.");

        if (mode == GameMode.Highscore && rounds is not null && rounds <= 0)
            throw new ArgumentException("Round count must be positive.");

        StartScore = startScore;
        Rounds = rounds;
    }
}
