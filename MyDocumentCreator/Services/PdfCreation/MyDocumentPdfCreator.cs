using System.IO;
using PuppeteerSharp;
using PuppeteerSharp.Media;
using Razor.Templating.Core;
using MyDocumentCreator.Models;
using Serilog;
using Azure;
using System.Xml.Linq;
using System.IO;
using System.Text.RegularExpressions;
using System.Drawing.Text;

namespace MyDocumentCreator.Services.PdfCreation
{
    public static class MyDocumentPdfCreator
    {

		public static async Task DownloadBrowserAsync()
        {
            // Download browser, if missing
            Log.Logger.Information("Downloading the browser...");
            await new BrowserFetcher().DownloadAsync();
            Log.Logger.Information("Download done.");
            return;
        }

        public static async Task CreatePdfAsync(string razorTemplateName, MyDocumentModel model, string savePath)
        {
            // Log
            Log.Logger.Information("CreateAsync()");
            Log.Logger.Information($"{nameof(razorTemplateName)}: {razorTemplateName}");
            Log.Logger.Information($"{nameof(savePath)}: {savePath}");

            // render the Razor template
            var html = await RazorTemplateEngine.RenderAsync(Path.Combine(Globals.DocumentRazorTemplateDirRelative, razorTemplateName) + ".cshtml", model);
            Console.WriteLine($"{nameof(html)}:\n{html}");
            //Console.ReadKey();

            // save HTML
            // help: https://codebuckets.com/2017/10/19/getting-the-root-directory-path-for-net-core-applications/
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Regex appPathMatcher = new Regex(@"(?<!fil)[A-Za-z]:\\+[\S\s]*?(?=\\+bin)");
            string projectDir = appPathMatcher.Match(baseDir).Value;
            string htmlPath = Path.Combine(projectDir, Globals.DocumentRazorTemplateDirRelative, Guid.NewGuid().ToString() + ".html"); File.WriteAllText(htmlPath, html);

            // get HTML file URI
            string htmlUri = new Uri(htmlPath, UriKind.Absolute).ToString();
            Console.WriteLine($"baseDir: {baseDir}");
            Console.WriteLine($"$projectDir: {projectDir}");
            Console.WriteLine($"htmlPath: {htmlPath}");
            Console.WriteLine($"htmlUri: {htmlUri}");
            
            #region Print HTML as PDF

            var pdfOptions = new PdfOptions();
            pdfOptions.Format = new PaperFormat((decimal)model.Width, (decimal)model.Height);
            pdfOptions.PrintBackground = true;

			string browserPath = Path.Combine(Directory.GetCurrentDirectory(), Globals.HeadlessBrowserPathRelative);
            Log.Logger.Information("Browser Path: " + browserPath);

            bool disposeBrowser = true;
            bool hideBrowser = true;

            if (disposeBrowser)
            {
                using (var browser = await Puppeteer.LaunchAsync(new LaunchOptions { Headless = hideBrowser, ExecutablePath = browserPath, DumpIO = true }))
                {
                    using (var page = await browser.NewPageAsync())
                    {
                        var navOptions = new NavigationOptions();
                        navOptions.WaitUntil = new WaitUntilNavigation[] { WaitUntilNavigation.Load, WaitUntilNavigation.DOMContentLoaded, WaitUntilNavigation.Networkidle2 };
                        await page.GoToAsync(htmlUri, navOptions);
                        await page.PdfAsync(savePath, pdfOptions);
                    }
                    File.Delete(htmlPath);
                }
            }
            else
            {
                var browser = await Puppeteer.LaunchAsync(new LaunchOptions { Headless = hideBrowser, ExecutablePath = browserPath, DumpIO = true });

                var page = await browser.NewPageAsync();
                    
                var navOptions = new NavigationOptions();
                navOptions.WaitUntil = new WaitUntilNavigation[] { WaitUntilNavigation.Load, WaitUntilNavigation.DOMContentLoaded, WaitUntilNavigation.Networkidle2 };
                await page.GoToAsync(htmlUri, navOptions);
                await page.PdfAsync(savePath, pdfOptions);
                    
                File.Delete(htmlPath);                
            }

            
                        

            #endregion


        }

    }
}
