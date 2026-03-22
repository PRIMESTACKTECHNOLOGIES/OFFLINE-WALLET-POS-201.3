using Microsoft.EntityFrameworkCore;
using Pos2013.Api.Models;

namespace Pos2013.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) { }

    public DbSet<Merchant> Merchants => Set<Merchant>();
    public DbSet<PaymentCode> PaymentCodes => Set<PaymentCode>();
    public DbSet<Terminal> Terminals => Set<Terminal>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Merchant>(e =>
        {
            e.ToTable("Merchants");
            e.HasKey(x => x.Id);
            e.Property(x => x.MerchantId).HasMaxLength(64);
        });

        modelBuilder.Entity<Terminal>(e =>
        {
            e.ToTable("Terminals");
            e.HasKey(x => x.Id);
            e.Property(x => x.TerminalId).HasMaxLength(64);
        });

        modelBuilder.Entity<PaymentCode>(e =>
        {
            e.ToTable("PaymentCodes");
            e.HasKey(x => x.Id);

            e.Property(x => x.Code).HasMaxLength(6);
            e.Property(x => x.Stan).HasMaxLength(6);
            e.Property(x => x.Amount).HasColumnType("decimal(18,2)");
            e.Property(x => x.Currency).HasMaxLength(10);
            e.Property(x => x.PanMasked).HasMaxLength(32);
            e.Property(x => x.MerchantId).HasMaxLength(64);
            e.Property(x => x.TerminalId).HasMaxLength(64);
        });
    }
}
