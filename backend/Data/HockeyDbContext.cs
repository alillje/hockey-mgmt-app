using HockeyTrainer.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Api.Data;

public sealed class HockeyDbContext : DbContext
{
    public HockeyDbContext(DbContextOptions<HockeyDbContext> options) : base(options)
    {
    }

    public DbSet<Drill> Drills => Set<Drill>();
    public DbSet<Training> Trainings => Set<Training>();
    public DbSet<TrainingEntry> TrainingEntries => Set<TrainingEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Drill>().Property(d => d.Title).HasMaxLength(120);
        modelBuilder.Entity<Drill>().Property(d => d.CategoryId).HasMaxLength(40);
        modelBuilder.Entity<Drill>().Property(d => d.Notes).HasMaxLength(6000);
        modelBuilder.Entity<Training>().Property(t => t.Title).HasMaxLength(120);
        modelBuilder.Entity<Training>().Property(t => t.Notes).HasMaxLength(6000);
        modelBuilder.Entity<TrainingEntry>().Property(i => i.Notes).HasMaxLength(6000);
        modelBuilder.Entity<Drill>().Property(d => d.TagsJson).HasDefaultValue("[]");
        modelBuilder.Entity<Training>().Property(t => t.TagsJson).HasDefaultValue("[]");
        modelBuilder.Entity<Training>().HasMany(t => t.Items).WithOne().HasForeignKey(i => i.TrainingId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<TrainingEntry>().HasOne(i => i.Drill).WithMany().HasForeignKey(i => i.DrillId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TrainingEntry>().HasIndex(i => new { i.TrainingId, i.Position });
    }
}
