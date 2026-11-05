using System.Text.Json.Serialization;
using LetsPlayDarts.Api.Auth;
using LetsPlayDarts.Api.Endpoints;
using LetsPlayDarts.Api.Realtime;
using LetsPlayDarts.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;

const string DevCorsPolicy = "DevCors";

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.AddDbContext<DartsDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DartsDb") ?? "Data Source=darts.db"));

builder.Services.AddCors(options =>
    options.AddPolicy(DevCorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin => Uri.TryCreate(origin, UriKind.Absolute, out var uri) && (uri.IsLoopback || IsPrivateLanHost(uri.Host)))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));

builder.Services.Configure<AuthOptions>(builder.Configuration.GetSection(AuthOptions.SectionName));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var signingKey = builder.Configuration[$"{AuthOptions.SectionName}:{nameof(AuthOptions.JwtSigningKey)}"]
            ?? throw new InvalidOperationException("Auth:JwtSigningKey is not configured.");
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Convert.FromBase64String(signingKey)),
        };
    });

builder.Services.AddAuthorization();

// SignalR has its own JSON protocol, separate from ConfigureHttpJsonOptions
// above - without this, enums (e.g. GameStatus) serialize as raw numbers
// over the hub's WebSocket messages while REST responses correctly send
// them as strings, silently breaking any client code that string-compares
// a value it only ever received via a SignalR broadcast.
builder.Services.AddSignalR().AddJsonProtocol(options =>
    options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<IDeviceOnlineTracker, DeviceOnlineTracker>();
builder.Services.AddSingleton<IUnassignedDeviceTracker, UnassignedDeviceTracker>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<DartsDbContext>().Database.MigrateAsync();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors(DevCorsPolicy);
}

app.UseHttpsRedirection();

// Serves the built frontend (frontend/dist) from this same process/port -
// "Ein Server-Prozess" per the project plan. Regie, Tablet, Monitor and the
// API all become the same origin this way, so window.location.origin (used
// e.g. for the QR-pairing codes) is always correct, no matter which
// address a device used to reach it. Guarded by Directory.Exists so a
// backend-only `dotnet run` still works before the frontend has ever been
// built.
var frontendDistPath = Path.Combine(builder.Environment.ContentRootPath, "..", "..", "frontend", "dist");
if (Directory.Exists(frontendDistPath))
{
    var frontendFiles = new PhysicalFileProvider(frontendDistPath);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = frontendFiles });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = frontendFiles, OnPrepareResponse = SetFrontendCacheControl });
}

app.UseAuthentication();
app.UseAuthorization();

app.MapAuthEndpoints();
app.MapEventEndpoints();
app.MapTeamEndpoints();
app.MapTournamentEndpoints();
app.MapGameEndpoints();
app.MapKnockoutEndpoints();
app.MapGroupEndpoints();
app.MapDeviceEndpoints();
app.MapServerInfoEndpoints();
app.MapAdminEndpoints();
app.MapLeinwandEndpoints();
app.MapHub<GameHub>("/hubs/game");

if (Directory.Exists(frontendDistPath))
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontendDistPath),
        OnPrepareResponse = SetFrontendCacheControl,
    });
}

app.Run();

// Without this, index.html has no Cache-Control header at all, so browsers
// fall back to heuristic caching - a Kiosk WebView (no "hard refresh"
// gesture available on a TV remote) can then keep serving a stale
// index.html referencing an old, no-longer-served JS bundle hash
// indefinitely, surviving even a full device power-cycle since the
// WebView's HTTP cache is on persistent storage. /assets/* filenames are
// content-hashed by the Vite build, so those are safe (and good) to cache
// aggressively - whenever their content changes, so does the URL
// index.html points at. Shared between the direct static-file middleware
// and the SPA fallback route (client-side routes like /?tablet=... only
// match the latter), which otherwise silently used a plain StaticFileOptions
// with no cache headers of its own.
static void SetFrontendCacheControl(StaticFileResponseContext ctx)
{
    var headers = ctx.Context.Response.GetTypedHeaders();
    headers.CacheControl = ctx.Context.Request.Path.StartsWithSegments("/assets")
        ? new Microsoft.Net.Http.Headers.CacheControlHeaderValue
        {
            Public = true,
            MaxAge = TimeSpan.FromDays(365),
            Extensions = { Microsoft.Net.Http.Headers.NameValueHeaderValue.Parse("immutable") },
        }
        : new Microsoft.Net.Http.Headers.CacheControlHeaderValue { NoCache = true, MustRevalidate = true };
}

// Lets devices on the same local network (e.g. a real tablet/board monitor,
// not just this machine) reach the dev server, without opening CORS up to
// arbitrary internet origins.
static bool IsPrivateLanHost(string host) =>
    System.Net.IPAddress.TryParse(host, out var ip) &&
    ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
    ip.GetAddressBytes() is [10, ..] or [172, >= 16 and <= 31, ..] or [192, 168, ..];