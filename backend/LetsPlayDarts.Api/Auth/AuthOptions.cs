namespace LetsPlayDarts.Api.Auth;

public class AuthOptions
{
    public const string SectionName = "Auth";

    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string JwtSigningKey { get; set; } = string.Empty;
    public int TokenLifetimeHours { get; set; } = 12;
}
