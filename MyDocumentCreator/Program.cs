using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyDocumentCreator.Data;
using MyDocumentCreator.Models;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddDbContext<MyDocumentCreatorDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("MyDocumentCreatorDb") ?? throw new InvalidOperationException("Connection string 'RazorPagesMovieContext' not found.")));

//
//builder.Services.AddRazorTemplating();

//
builder.Services.AddAntiforgery(o => o.HeaderName = "XSRF-TOKEN");

// Add Serilog support
builder.Host.UseSerilog((context, configuration) =>
    configuration.ReadFrom.Configuration(context.Configuration));

var app = builder.Build();


// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

//Add support to logging request with SERILOG
app.UseSerilogRequestLogging();

app.UseRouting();

app.UseAuthorization();

app.MapRazorPages();

app.Run();
