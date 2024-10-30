using Microsoft.EntityFrameworkCore;
using Microsoft.Identity.Client;
using MyDocumentCreator.Models;

namespace MyDocumentCreator.Data
{
    public class MyDocumentCreatorDbContext : DbContext
    {
        public MyDocumentCreatorDbContext(DbContextOptions<MyDocumentCreatorDbContext> options) : base(options) { }

        public DbSet<MyDocumentModel> MyDocuments { get; set; }
    }
}
