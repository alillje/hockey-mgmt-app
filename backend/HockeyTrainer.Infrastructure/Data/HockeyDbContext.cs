using HockeyTrainer.Domain.Models;
using Microsoft.EntityFrameworkCore;

namespace HockeyTrainer.Infrastructure.Data;

public sealed class HockeyDbContext(DbContextOptions<HockeyDbContext> options) : DbContext(options)
{
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<BrowserSession> BrowserSessions => Set<BrowserSession>();
    public DbSet<UserPreferences> UserPreferences => Set<UserPreferences>();
    public DbSet<AgeGroup> AgeGroups => Set<AgeGroup>();
    public DbSet<Drill> Drills => Set<Drill>();
    public DbSet<Training> Trainings => Set<Training>();
    public DbSet<TrainingEntry> TrainingEntries => Set<TrainingEntry>();

    public DbSet<Organisation> Organisations => Set<Organisation>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<OrganisationMember> OrganisationMembers => Set<OrganisationMember>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        if (Database.IsNpgsql())
        {
            modelBuilder.HasDefaultSchema(DatabaseConfiguration.ApplicationSchema);
        }

        modelBuilder.Entity<UserProfile>().HasKey(profile => profile.UserId);
        modelBuilder.Entity<UserProfile>().Property(profile => profile.FirstName).HasMaxLength(100);
        modelBuilder.Entity<UserProfile>().Property(profile => profile.LastName).HasMaxLength(100);
        modelBuilder.Entity<UserProfile>().Property(profile => profile.Email).HasMaxLength(254);

        modelBuilder.Entity<BrowserSession>().HasKey(s => s.IdHash);
        modelBuilder.Entity<BrowserSession>().Property(s => s.IdHash).HasMaxLength(64);
        modelBuilder.Entity<BrowserSession>().Property(s => s.Email).HasMaxLength(254);
        modelBuilder.Entity<BrowserSession>().HasIndex(s => s.AbsoluteExpiresAt);
        modelBuilder.Entity<BrowserSession>().HasIndex(s => s.IdleExpiresAt);

        modelBuilder.Entity<UserPreferences>().HasKey(p => p.UserId);
        modelBuilder.Entity<UserPreferences>().HasOne<Team>().WithMany().HasForeignKey(p => p.DefaultTeamId).OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<AgeGroup>().Property(group => group.Id).HasMaxLength(40);
        modelBuilder.Entity<AgeGroup>().Property(group => group.Name).HasMaxLength(40);
        modelBuilder.Entity<AgeGroup>().HasData(AgeGroupSeed.Items.ToArray());

        modelBuilder.Entity<Organisation>().Property(o => o.Name).HasMaxLength(120);
        modelBuilder.Entity<Team>().Property(t => t.Name).HasMaxLength(120);
        modelBuilder.Entity<Team>().Property(t => t.AgeGroup).HasMaxLength(40);
        modelBuilder.Entity<Team>().HasAlternateKey(t => new { t.OrganisationId, t.Id });
        modelBuilder.Entity<Team>().HasOne<Organisation>().WithMany().HasForeignKey(t => t.OrganisationId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<OrganisationMember>().HasKey(m => new { m.OrganisationId, m.UserId });
        modelBuilder.Entity<OrganisationMember>().HasIndex(m => m.UserId);
        modelBuilder.Entity<OrganisationMember>().Property(m => m.Role).HasMaxLength(20);
        modelBuilder.Entity<OrganisationMember>().HasOne<Organisation>().WithMany().HasForeignKey(m => m.OrganisationId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<TeamMember>().HasKey(m => new { m.TeamId, m.UserId });
        modelBuilder.Entity<TeamMember>().HasIndex(m => m.UserId);
        modelBuilder.Entity<TeamMember>().Property(m => m.Role).HasMaxLength(20);
        modelBuilder.Entity<TeamMember>().HasOne<Team>().WithMany().HasForeignKey(m => m.TeamId).OnDelete(DeleteBehavior.Restrict);
        ConfigureOwnership<Drill>(modelBuilder);
        ConfigureOwnership<Training>(modelBuilder);
        modelBuilder.Entity<Organisation>().HasData(new Organisation
        {
            Id = WorkspaceDefaults.OrganisationId,
            Name = "Legacy workspace"
        });
        modelBuilder.Entity<Team>().HasData(new Team
        {
            Id = WorkspaceDefaults.TeamId,
            OrganisationId = WorkspaceDefaults.OrganisationId,
            Name = "Local team"
        });
        modelBuilder.Entity<OrganisationMember>().HasData(new OrganisationMember
        {
            OrganisationId = WorkspaceDefaults.OrganisationId,
            UserId = WorkspaceDefaults.LocalUserId,
            Role = "admin"
        });

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

    private static void ConfigureOwnership<T>(ModelBuilder modelBuilder) where T : class, IOwnedContent
    {
        var entity = modelBuilder.Entity<T>();
        entity.Property(c => c.AgeGroup).HasMaxLength(40).HasDefaultValue("");
        entity.Property(c => c.AgeGroupsJson).HasDefaultValue("[]");
        entity.Property(c => c.OrganisationId).HasDefaultValue(WorkspaceDefaults.OrganisationId);
        entity.Property(c => c.OwnerTeamId).HasDefaultValue(WorkspaceDefaults.TeamId).ValueGeneratedNever();
        entity.Property(c => c.OriginTeamId).HasDefaultValue(WorkspaceDefaults.TeamId).ValueGeneratedNever();
        entity.Property(c => c.CreatedByUserId).HasDefaultValue(WorkspaceDefaults.LocalUserId);
        entity.HasIndex(c => new { c.OrganisationId, c.OwnerTeamId });
        entity.HasOne<Organisation>().WithMany().HasForeignKey(c => c.OrganisationId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<Team>().WithMany().HasForeignKey(c => new { c.OrganisationId, c.OwnerTeamId })
            .HasPrincipalKey(t => new { t.OrganisationId, t.Id }).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<Team>().WithMany().HasForeignKey(c => new { c.OrganisationId, c.OriginTeamId })
            .HasPrincipalKey(t => new { t.OrganisationId, t.Id }).OnDelete(DeleteBehavior.Restrict);
    }
}
