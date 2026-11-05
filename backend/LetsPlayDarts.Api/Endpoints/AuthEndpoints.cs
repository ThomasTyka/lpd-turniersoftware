using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using LetsPlayDarts.Api.Auth;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace LetsPlayDarts.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/login", (LoginRequest request, IOptions<AuthOptions> authOptions) =>
        {
            var options = authOptions.Value;

            if (request.Username != options.Username || !PasswordHasher.Verify(request.Password, options.PasswordHash))
                return Results.Unauthorized();

            var key = new SymmetricSecurityKey(Convert.FromBase64String(options.JwtSigningKey));
            var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                claims: [new Claim(ClaimTypes.Name, options.Username)],
                expires: DateTime.UtcNow.AddHours(options.TokenLifetimeHours),
                signingCredentials: credentials);

            return Results.Ok(new LoginResponse(new JwtSecurityTokenHandler().WriteToken(token)));
        });
    }
}

public record LoginRequest(string Username, string Password);

public record LoginResponse(string Token);
