using LetsPlayDarts.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace LetsPlayDarts.Infrastructure;

public class DartsDbContext(DbContextOptions<DartsDbContext> options) : DbContext(options)
{
    public DbSet<Event> Events => Set<Event>();

    public DbSet<Tournament> Tournaments => Set<Tournament>();

    public DbSet<Player> Players => Set<Player>();

    public DbSet<Board> Boards => Set<Board>();

    public DbSet<Game> Games => Set<Game>();

    public DbSet<Device> Devices => Set<Device>();

    public DbSet<KnockoutMatch> KnockoutMatches => Set<KnockoutMatch>();

    public DbSet<GroupRound> GroupRounds => Set<GroupRound>();

    public DbSet<Team> Teams => Set<Team>();

    public DbSet<LeinwandSettings> LeinwandSettings => Set<LeinwandSettings>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Event>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Id).ValueGeneratedNever();

            entity.HasMany(e => e.Players)
                .WithOne()
                .HasForeignKey("EventId")
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Tournaments)
                .WithOne()
                .HasForeignKey("EventId")
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Boards)
                .WithOne()
                .HasForeignKey("EventId")
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Teams)
                .WithOne()
                .HasForeignKey("EventId")
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Tournament>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Id).ValueGeneratedNever();
            entity.OwnsOne(t => t.QualificationSettings);
            entity.OwnsOne(t => t.FinalSettings);
        });

        modelBuilder.Entity<Player>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.Property(p => p.Id).ValueGeneratedNever();
        });

        modelBuilder.Entity<Board>(entity =>
        {
            entity.HasKey(b => b.Id);
            entity.Property(b => b.Id).ValueGeneratedNever();
        });

        modelBuilder.Entity<Game>(entity =>
        {
            entity.HasKey(g => g.Id);
            entity.Property(g => g.Id).ValueGeneratedNever();
            entity.HasIndex(g => g.KnockoutMatchId);
            entity.HasIndex(g => g.GroupRoundId);

            entity.OwnsMany(g => g.Entries, entry =>
            {
                entry.WithOwner().HasForeignKey("GameId");
                entry.HasKey(e => e.Id);
                entry.Property(e => e.Id).ValueGeneratedNever();
                entry.PrimitiveCollection(e => e.RoundScores);
            });
        });

        modelBuilder.Entity<Device>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.Property(d => d.Id).ValueGeneratedNever();
            entity.HasIndex(d => new { d.EventId, d.ClientDeviceId }).IsUnique();
        });

        modelBuilder.Entity<KnockoutMatch>(entity =>
        {
            entity.HasKey(m => m.Id);
            entity.Property(m => m.Id).ValueGeneratedNever();
            entity.HasIndex(m => new { m.TournamentId, m.Round });
        });

        modelBuilder.Entity<GroupRound>(entity =>
        {
            entity.HasKey(g => g.Id);
            entity.Property(g => g.Id).ValueGeneratedNever();
            entity.HasIndex(g => new { g.TournamentId, g.Round });
            entity.PrimitiveCollection(g => g.ParticipantIds);
            entity.PrimitiveCollection(g => g.AdvancingPlayerIds);
        });

        modelBuilder.Entity<Team>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Id).ValueGeneratedNever();
            entity.PrimitiveCollection(t => t.PlayerIds);
        });

        modelBuilder.Entity<LeinwandSettings>(entity =>
        {
            entity.HasKey(s => s.EventId);
            entity.Property(s => s.EventId).ValueGeneratedNever();
            entity.PrimitiveCollection(s => s.ActiveScenes);
        });
    }
}
