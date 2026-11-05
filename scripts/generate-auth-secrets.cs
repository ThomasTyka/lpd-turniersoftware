// Generates values for docker/.env: a password hash matching
// backend/LetsPlayDarts.Api/Auth/PasswordHasher.cs, and a random JWT signing key.
// Usage: dotnet run scripts/generate-auth-secrets.cs <password>
using System.Security.Cryptography;

if (args.Length != 1)
{
    Console.Error.WriteLine("Usage: dotnet run scripts/generate-auth-secrets.cs <password>");
    return 1;
}

const int SaltSize = 16;
const int HashSize = 32;
const int Iterations = 100_000;

var salt = RandomNumberGenerator.GetBytes(SaltSize);
var hash = Rfc2898DeriveBytes.Pbkdf2(args[0], salt, Iterations, HashAlgorithmName.SHA256, HashSize);
var passwordHash = $"{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
var jwtSigningKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));

Console.WriteLine($"Auth__PasswordHash={passwordHash}");
Console.WriteLine($"Auth__JwtSigningKey={jwtSigningKey}");
return 0;
