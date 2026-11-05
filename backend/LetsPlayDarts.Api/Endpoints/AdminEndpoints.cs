using System.Text.Json;

namespace LetsPlayDarts.Api.Endpoints;

public static class AdminEndpoints
{
    // scripts/update-watcher.ps1 runs directly on the Windows host and polls
    // this same directory - the container has no git or docker access of its
    // own to pull/rebuild itself, so this file-based handoff is how the
    // button reaches outside the container. Mounted via docker-compose.yml's
    // ./update-ipc:/update-ipc.
    private const string IpcDir = "/update-ipc";
    private static string TriggerPath => Path.Combine(IpcDir, "trigger.json");
    private static string StatusPath => Path.Combine(IpcDir, "status.json");

    public static void MapAdminEndpoints(this WebApplication app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization();

        admin.MapPost("/update", () =>
        {
            if (!Directory.Exists(IpcDir))
                return Results.Problem("update-ipc-Verzeichnis nicht gefunden - läuft der Update-Watcher auf dem Host?", statusCode: 503);

            var status = ReadStatus();
            if (status?.State == "running")
                return Results.Ok(status);

            File.WriteAllText(TriggerPath, JsonSerializer.Serialize(new { requestedAt = DateTimeOffset.UtcNow }));
            return Results.Ok(new UpdateStatusDto("running", "Update angefordert...", DateTimeOffset.UtcNow));
        });

        admin.MapGet("/update/status", () =>
        {
            var status = ReadStatus();
            return Results.Ok(status ?? new UpdateStatusDto("idle", null, null));
        });
    }

    private static UpdateStatusDto? ReadStatus()
    {
        if (!File.Exists(StatusPath)) return null;
        try
        {
            // The watcher script may be mid-write; a failed parse just means
            // "ask again shortly", not a real error worth surfacing.
            var json = File.ReadAllText(StatusPath);
            return JsonSerializer.Deserialize<UpdateStatusDto>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (IOException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

public record UpdateStatusDto(string State, string? Message, DateTimeOffset? At);
