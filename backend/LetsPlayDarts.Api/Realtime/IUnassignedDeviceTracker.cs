using System.Collections.Concurrent;
using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Api.Realtime;

/// <summary>
/// Tracks Tablets/Monitors that are connected but not yet paired to a
/// board, so the Regie can assign one from the Notebook without any
/// interaction on the device itself ("Geräteverwaltung: ... alles vom
/// Notebook aus änderbar" - project plan 3.2). In-memory only, same
/// lifetime/scope as IDeviceOnlineTracker - entries simply age out (see
/// StaleAfter) rather than needing an explicit disconnect hook, since an
/// unassigned device re-announces itself periodically while waiting.
/// </summary>
public interface IUnassignedDeviceTracker
{
    void Announce(Guid eventId, Guid clientDeviceId, DeviceType type, string shortCode);
    void Remove(Guid clientDeviceId);
    IReadOnlyList<UnassignedDeviceEntry> GetForEvent(Guid eventId);
}

public record UnassignedDeviceEntry(Guid ClientDeviceId, DeviceType Type, string ShortCode, DateTime LastSeenAt);

public class UnassignedDeviceTracker : IUnassignedDeviceTracker
{
    private static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(45);

    private readonly ConcurrentDictionary<Guid, (Guid EventId, UnassignedDeviceEntry Entry)> _devices = new();

    public void Announce(Guid eventId, Guid clientDeviceId, DeviceType type, string shortCode) =>
        _devices[clientDeviceId] = (eventId, new UnassignedDeviceEntry(clientDeviceId, type, shortCode, DateTime.UtcNow));

    public void Remove(Guid clientDeviceId) => _devices.TryRemove(clientDeviceId, out _);

    public IReadOnlyList<UnassignedDeviceEntry> GetForEvent(Guid eventId) =>
        _devices.Values
            .Where(d => d.EventId == eventId && DateTime.UtcNow - d.Entry.LastSeenAt < StaleAfter)
            .Select(d => d.Entry)
            .ToList();
}
