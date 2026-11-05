using Microsoft.AspNetCore.SignalR;

namespace LetsPlayDarts.Api.Realtime;

/// <summary>
/// Broadcasts live game updates to connected displays (board monitors,
/// Leinwand). Clients join a group per game or per board (see project
/// plan: "Kanal pro Board") so each display only receives the data it
/// needs. Read-only for clients - no [Authorize], since display screens
/// don't need a Regie login, only the mutation endpoints do.
/// </summary>
public class GameHub(IDeviceOnlineTracker onlineTracker) : Hub
{
    public static string GroupName(Guid gameId) => $"game-{gameId}";

    public static string BoardGroupName(Guid boardId) => $"board-{boardId}";

    public static string TournamentGroupName(Guid tournamentId) => $"tournament-{tournamentId}";

    public static string LeinwandGroupName(Guid eventId) => $"leinwand-{eventId}";

    public Task JoinGame(Guid gameId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, GroupName(gameId));

    public Task LeaveGame(Guid gameId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(gameId));

    /// <summary>
    /// A board monitor joins its board's group once paired, so it
    /// automatically follows whichever game starts there next -
    /// without needing to know a specific game id.
    /// </summary>
    public Task JoinBoard(Guid boardId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, BoardGroupName(boardId));

    public Task LeaveBoard(Guid boardId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, BoardGroupName(boardId));

    /// <summary>
    /// The knockout bracket view joins its tournament's group to live-update
    /// as legs are played and rounds are generated.
    /// </summary>
    public Task JoinTournament(Guid tournamentId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, TournamentGroupName(tournamentId));

    public Task LeaveTournament(Guid tournamentId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, TournamentGroupName(tournamentId));

    /// <summary>
    /// The Leinwand joins its event's group so scene-rotation settings
    /// changed from the Regie ("Steuerung vom Notebook", project plan 3.3)
    /// apply live, without needing a reload.
    /// </summary>
    public Task JoinLeinwand(Guid eventId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, LeinwandGroupName(eventId));

    public Task LeaveLeinwand(Guid eventId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, LeinwandGroupName(eventId));

    /// <summary>
    /// A paired Tablet or Monitor calls this once connected to mark
    /// itself online (see IDeviceOnlineTracker).
    /// </summary>
    public void RegisterDevice(Guid clientDeviceId) =>
        onlineTracker.MarkOnline(Context.ConnectionId, clientDeviceId);

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        onlineTracker.MarkOffline(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}
