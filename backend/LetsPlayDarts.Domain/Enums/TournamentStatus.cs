namespace LetsPlayDarts.Domain.Enums;

/// <summary>
/// Represents the current lifecycle state of a tournament.
/// </summary>
public enum TournamentStatus
{
    Draft,
    Running,
    FinalStarted,
    Finished,
    Cancelled
}