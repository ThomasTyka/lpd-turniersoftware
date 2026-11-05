using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

namespace LetsPlayDarts.Api.Endpoints;

public static class ServerInfoEndpoints
{
    public static void MapServerInfoEndpoints(this WebApplication app)
    {
        // Anonymous - lets the Regie auto-detect this machine's LAN address
        // for QR-pairing codes even when the Regie itself was opened via
        // "localhost". A device scanning the code needs a real, reachable
        // address, not the loopback one the server sees itself as.
        app.MapGet("/api/server-info", (IConfiguration config) =>
        {
            // Inside a Docker container, NetworkInterface only sees the
            // container's own virtual bridge NIC (also a private-range
            // address, e.g. 172.18.0.2) - the host machine's real LAN NIC is
            // in a different network namespace and isn't visible at all, so
            // auto-detection can't work there. Server:LanAddress lets it be
            // configured explicitly for that case; bare-metal `dotnet run`
            // keeps working via auto-detection.
            var configuredAddress = config["Server:LanAddress"];
            var lanAddress = !string.IsNullOrWhiteSpace(configuredAddress)
                ? configuredAddress
                : NetworkInterface.GetAllNetworkInterfaces()
                    .Where(nic => nic.OperationalStatus == OperationalStatus.Up)
                    .SelectMany(nic => nic.GetIPProperties().UnicastAddresses)
                    .Select(addr => addr.Address)
                    .Where(ip => ip.AddressFamily == AddressFamily.InterNetwork)
                    .FirstOrDefault(IsPrivateLan)
                    ?.ToString();

            return Results.Ok(new ServerInfoDto(lanAddress));
        });
    }

    private static bool IsPrivateLan(IPAddress ip) =>
        ip.GetAddressBytes() is [10, ..] or [172, >= 16 and <= 31, ..] or [192, 168, ..];
}

public record ServerInfoDto(string? LanAddress);
