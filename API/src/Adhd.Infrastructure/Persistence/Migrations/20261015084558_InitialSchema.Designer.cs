// Bu dosyayı EF Core oluşturdu.
using Adhd.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Adhd.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(PlannerDbContext))]
    [Migration("20261015084558_InitialSchema")]
    partial class InitialSchema
    {
        // Açıklama üst sınıftaki tanımda.
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
#pragma warning disable 612, 618
            modelBuilder
                .HasAnnotation("ProductVersion", "10.0.13")
                .HasAnnotation("Relational:MaxIdentifierLength", 63);

            NpgsqlModelBuilderExtensions.UseIdentityByDefaultColumns(modelBuilder);

            modelBuilder.Entity("Adhd.Infrastructure.Persistence.DatabaseMetadata", b =>
                {
                    b.Property<string>("Key")
                        .HasMaxLength(100)
                        .HasColumnType("character varying(100)");

                    b.Property<string>("Value")
                        .IsRequired()
                        .HasMaxLength(200)
                        .HasColumnType("character varying(200)");

                    b.HasKey("Key");

                    b.ToTable("app_metadata", (string)null);

                    b.HasData(
                        new
                        {
                            Key = "schema",
                            Value = "1"
                        });
                });
#pragma warning restore 612, 618
        }
    }
}
