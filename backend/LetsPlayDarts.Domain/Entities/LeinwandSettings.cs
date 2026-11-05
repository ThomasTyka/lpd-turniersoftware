namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// Leinwand scene-rotation configuration for an event ("Playlists: Szenen
/// rotieren automatisch im einstellbaren Takt - oder du schaltest manuell
/// um, z. B. fürs Finale: nur das Finale, groß", project plan 3.3). One
/// row per event, keyed by EventId - only a single, shared Leinwand is
/// modeled for now, not multiple independently configured screens.
/// </summary>
public class LeinwandSettings
{
    public Guid EventId { get; private set; }

    private readonly List<string> _activeScenes = ["scores", "leaderboard"];
    public IReadOnlyList<string> ActiveScenes => _activeScenes;

    public int IntervalSeconds { get; private set; } = 10;

    /// <summary>
    /// When set, the Leinwand shows only this scene instead of rotating.
    /// </summary>
    public string? PinnedScene { get; private set; }

    private LeinwandSettings()
    {
    }

    public LeinwandSettings(Guid eventId)
    {
        EventId = eventId;
    }

    public void Update(IReadOnlyList<string> activeScenes, int intervalSeconds, string? pinnedScene)
    {
        if (intervalSeconds <= 0)
            throw new ArgumentException("intervalSeconds must be positive.", nameof(intervalSeconds));

        _activeScenes.Clear();
        _activeScenes.AddRange(activeScenes.Distinct());
        IntervalSeconds = intervalSeconds;
        PinnedScene = pinnedScene;
    }
}
