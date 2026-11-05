using LetsPlayDarts.Domain.Enums;

namespace LetsPlayDarts.Domain.Entities;

/// <summary>
/// A Tablet or Monitor paired to a board. Identified by a client-generated
/// <see cref="ClientDeviceId"/> that the device persists locally (e.g.
/// localStorage), so it can look up its own pairing again after a
/// restart/crash without any server-side login.
/// </summary>
public class Device
{
    public Guid Id { get; private set; }

    public Guid ClientDeviceId { get; private set; }

    public Guid EventId { get; private set; }

    public DeviceType Type { get; private set; }

    public Guid BoardId { get; private set; }

    public DateTime PairedAt { get; private set; }

    /// <summary>
    /// Optional end of this pairing's validity ("Zeitfenster (von-bis)",
    /// project plan 3.1) - null means unlimited, matching "oder du lässt
    /// das Fenster weg und wechselst einfach manuell, wann du willst".
    /// Past this point the device is treated as unpaired again.
    /// </summary>
    public DateTime? ExpiresAt { get; private set; }

    public bool IsExpired => ExpiresAt is { } expiresAt && expiresAt <= DateTime.UtcNow;

    private Device()
    {
    }

    public Device(Guid clientDeviceId, Guid eventId, DeviceType type, Guid boardId, DateTime? expiresAt = null)
    {
        Id = Guid.NewGuid();
        ClientDeviceId = clientDeviceId;
        EventId = eventId;
        Type = type;
        BoardId = boardId;
        PairedAt = DateTime.UtcNow;
        ExpiresAt = expiresAt;
    }

    /// <summary>
    /// Re-pairs this device to a different board.
    /// </summary>
    public void Repair(Guid boardId, DateTime? expiresAt = null)
    {
        BoardId = boardId;
        PairedAt = DateTime.UtcNow;
        ExpiresAt = expiresAt;
    }
}
