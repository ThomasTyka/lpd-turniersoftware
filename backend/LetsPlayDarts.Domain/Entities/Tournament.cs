using LetsPlayDarts.Domain.Enums;
using LetsPlayDarts.Domain.ValueObjects;

namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Represents a tournament within an event.
/// Qualification and final can use different game settings (see ADR-004).
/// </summary>
public class Tournament
{
    public Guid Id { get; private set; }

    public GameSettings QualificationSettings { get; private set; } = null!;

    public GameSettings FinalSettings { get; private set; } = null!;

    public TournamentStatus Status { get; private set; }

    /// <summary>
    /// "Summe der besten X Spiele" for the qualification ranking - a
    /// persistent event-wide setting (mirrors the old system's
    /// event.bestOfX), rather than an ad-hoc number typed in each time the
    /// ranking is viewed. Null means "count every finished game".
    /// </summary>
    public int? QualificationBestOf { get; private set; }

    /// <summary>
    /// Free-text label for "which KO phase are we in right now" (e.g.
    /// "Achtelfinale"), mirroring the old system's <c>phase</c> field: a
    /// plain value you set via a dropdown at any time, completely decoupled
    /// from the actual bracket data (see PhaseForm in the old source - just
    /// updateEvent with an arbitrary phase, no validation against real
    /// games). Purely a manual display label - the real KO bracket
    /// (KnockoutMatch.Round) keeps advancing automatically regardless of
    /// this value. Null means no manual override is set.
    /// </summary>
    public string? KnockoutPhaseOverride { get; private set; }

    private Tournament()
    {
    }

    /// <summary>
    /// Creates a new tournament in draft status.
    /// </summary>
    /// <param name="qualificationSettings">The game settings used for the qualification phase.</param>
    /// <param name="finalSettings">The game settings used for the final phase.</param>
    /// <param name="qualificationBestOf">
    /// "Summe der besten X Spiele" for the qualification ranking. Null counts every finished game.
    /// </param>
    public Tournament(GameSettings qualificationSettings, GameSettings finalSettings, int? qualificationBestOf = null)
    {
        QualificationSettings = qualificationSettings ?? throw new ArgumentNullException(nameof(qualificationSettings));
        FinalSettings = finalSettings ?? throw new ArgumentNullException(nameof(finalSettings));

        if (qualificationBestOf is <= 0)
            throw new ArgumentException("Qualification best-of must be positive.", nameof(qualificationBestOf));

        Id = Guid.NewGuid();
        Status = TournamentStatus.Draft;
        QualificationBestOf = qualificationBestOf;
    }

    /// <summary>
    /// Updates the persistent "Summe der besten X Spiele" setting for the
    /// qualification ranking.
    /// </summary>
    public void SetQualificationBestOf(int? qualificationBestOf)
    {
        if (qualificationBestOf is <= 0)
            throw new ArgumentException("Qualification best-of must be positive.", nameof(qualificationBestOf));

        QualificationBestOf = qualificationBestOf;
    }

    /// <summary>
    /// Changes the qualification phase's game settings (mode/start score/
    /// rounds). Allowed regardless of Status, mirroring the old system
    /// where these settings stayed editable for the whole lifetime of an
    /// event - only newly created games pick up the new settings, games
    /// already recorded keep their own values.
    /// </summary>
    public void EditQualificationSettings(GameSettings settings)
    {
        QualificationSettings = settings ?? throw new ArgumentNullException(nameof(settings));
    }

    /// <summary>
    /// Changes the final phase's game settings (mode/start score/rounds).
    /// Allowed regardless of Status - see <see cref="EditQualificationSettings"/>.
    /// </summary>
    public void EditFinalSettings(GameSettings settings)
    {
        FinalSettings = settings ?? throw new ArgumentNullException(nameof(settings));
    }

    /// <summary>
    /// Sets the tournament status directly, to any value, regardless of the
    /// current status - mirrors the old system's free phase dropdown
    /// (updateEvent with an arbitrary phase, guarded only by a UI tooltip
    /// warning, no server-side validation). Callers are responsible for not
    /// doing this while games are actively being played.
    /// </summary>
    public void SetStatus(TournamentStatus status)
    {
        Status = status;
    }

    /// <summary>
    /// Sets (or clears, with null) the manual KO-phase override label - see
    /// <see cref="KnockoutPhaseOverride"/>. No validation, by design.
    /// </summary>
    public void SetKnockoutPhaseOverride(string? label)
    {
        KnockoutPhaseOverride = label;
    }
}
