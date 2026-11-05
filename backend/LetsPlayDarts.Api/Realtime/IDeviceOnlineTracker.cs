using System.Collections.Concurrent;

namespace LetsPlayDarts.Api.Realtime;

/// <summary>
/// Tracks which paired devices currently have an open SignalR connection
/// ("Geräteverwaltung: ... mit Online-/Offline-Status in Echtzeit" from
/// the project plan). In-memory only - fine for a single-server-process
/// deployment (see project plan: "ein Server-Prozess" instead of
/// multiple containers), doesn't survive a restart.
/// </summary>
public interface IDeviceOnlineTracker
{
    void MarkOnline(string connectionId, Guid clientDeviceId);
    void MarkOffline(string connectionId);
    bool IsOnline(Guid clientDeviceId);
}

public class DeviceOnlineTracker : IDeviceOnlineTracker
{
    private readonly ConcurrentDictionary<string, Guid> _connectionToDevice = new();

    public void MarkOnline(string connectionId, Guid clientDeviceId) =>
        _connectionToDevice[connectionId] = clientDeviceId;

    public void MarkOffline(string connectionId) =>
        _connectionToDevice.TryRemove(connectionId, out _);

    public bool IsOnline(Guid clientDeviceId) =>
        _connectionToDevice.Values.Contains(clientDeviceId);
}
