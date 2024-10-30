using Microsoft.AspNetCore.Mvc;
using MyDocumentCreator.Models;
using MyDocumentCreator.Services.PdfCreation;
using PdfToSvg;
using Serilog;
using Newtonsoft.Json;

namespace MyDocumentCreator.Pages
{
    public class IndexModel : Microsoft.AspNetCore.Mvc.RazorPages.PageModel
    {
        private readonly Data.MyDocumentCreatorDbContext _dbContext;

        public List<MyDocumentModel> MyDocuments
        {
            get { return _dbContext.MyDocuments.ToList<MyDocumentModel>(); }
        }


        [BindProperty]
        public MyDocumentModel MyDocument { get; set; }

        public IndexModel( Data.MyDocumentCreatorDbContext dbContext, IConfiguration _configuration ) { _dbContext = dbContext; }

        public async void OnGet() { }


        #region CREATE CUSTOM DOCUMENT, SERVE CUSTOM DOCUMENT
        // Receive user input, create PDF and record in database
        public async Task<IActionResult> OnPostSubmitDocumentData()
        {
            Console.WriteLine("OnPostSubmitDocumentData() called");
            if (!ModelState.IsValid)
            {
                return Page();
            }

            // field: TimeStamp
            MyDocument.TimeStamp = DateTime.UtcNow.ToString("yyyy.MM.dd HH:mm:ss");
            Console.WriteLine($"{nameof(MyDocumentModel.TimeStamp)}: {MyDocument.TimeStamp}");

            
            var uploadedFile = MyDocument.DrawingFileObj;
            if (uploadedFile != null)
            {
                // field: DrawingPdfFileName
                MyDocument.DrawingFileName = Path.GetFileName(uploadedFile.FileName);
                Console.WriteLine($"Filename: {MyDocument.DrawingFileName}");
                Console.WriteLine($"Length: {uploadedFile.Length}");

                // convert to SVG if it is a PDF file
                // field: DrawingSvg
                using (var memoryStream = new MemoryStream())
                {
                    await uploadedFile.CopyToAsync(memoryStream);

                    if (uploadedFile.ContentType == "application/pdf")
                    {
                        // save the first page of the PDF as SVG
                        using (var pdfDoc = PdfDocument.Open(memoryStream))
                        {
                            MyDocument.DrawingSvgString = pdfDoc.Pages[0].ToSvgString();
                        }
                        // for PdfToSvg.NET
                        MyDocument.SvgScaleCorrectionFactor = 128 / 96.0;
                    }
                    else if (uploadedFile.ContentType == "image/svg+xml")
                    {
                        memoryStream.Position = 0;
                        using (var reader = new StreamReader(memoryStream))
                        {
                            MyDocument.DrawingSvgString = await reader.ReadToEndAsync();
                        }
                    }
                    else
                    {
                        Console.WriteLine($"The attached file will be ignored. Content type was {uploadedFile.ContentType}");
                    }
                }


            }
            else
            {
                Console.WriteLine($"{nameof(MyDocumentModel.DrawingFileObj)} was null!");
            }

            // feed document data as JSOON
            MyDocument.DocumentDataJson = JsonConvert.SerializeObject(new
            {
                Width = MyDocument.Width,
                Height = MyDocument.Height,
                Margin = MyDocument.Margin,
                DrawingScaleInSource = MyDocument.DrawingScaleInSource,
                SvgScaleCorrectionFactor = MyDocument.SvgScaleCorrectionFactor
            }, Formatting.Indented);

            Console.WriteLine($"{nameof(MyDocument.DocumentDataJson)}:\n{MyDocument.DocumentDataJson}");
            Console.WriteLine($"SvgScaleCorrectionFactor: {MyDocument.SvgScaleCorrectionFactor}");
            //Console.ReadKey();

            // field: DocumentPdfFileName
            // Create the PDF
            string? filename = Guid.NewGuid().ToString() + ".pdf";
            string savePath = Path.Combine(Directory.GetCurrentDirectory(), Globals.FileStorageDir, filename);
            Console.WriteLine($"{nameof(MyDocument.DrawingSvgString)}\n{MyDocument.DrawingSvgString}");
            //Console.ReadKey();
            await MyDocumentPdfCreator.CreatePdfAsync(Globals.DocumentRazorTemplateName, MyDocument, savePath);
            MyDocument.DocumentFileName = filename;

            // Save changes to database
            await _dbContext.MyDocuments.AddAsync(MyDocument);
            await _dbContext.SaveChangesAsync();

            return RedirectToPage("./Index");
        }

        // Get a custom document from the backend
        public JsonResult OnPostGetLastDocument()
        {
            Log.Logger.Information("OnPostGetLastDocument() called");

            return OnPostGetDocument(_dbContext.MyDocuments.OrderByDescending(doc => doc.Id).FirstOrDefault().Id);
        }

        public JsonResult OnPostGetDocument(long id)
        {
            Log.Logger.Information("OnPostGetDocument() called");
            Console.WriteLine($"id: {id}");
            //Console.ReadKey();

            // get the last record
            MyDocumentModel? myDocument = _dbContext.MyDocuments.Find(id);
            byte[] bytes = [];
            if (myDocument != null)
            {
                string? filename = myDocument.DocumentFileName;
                if (filename != null)
                {
                    try
                    {
                        bytes = System.IO.File.ReadAllBytes(Path.Combine(Directory.GetCurrentDirectory(), Globals.FileStorageDir, filename));
                    }
                    catch { }                    
                }

            }

            Console.WriteLine($"Title: {myDocument.Title}");
            //Console.ReadKey();

            return new JsonResult(new
            {
                Title = myDocument?.Title ?? "Document",
                ContentType = "application/pdf",
                Data = bytes
            });
        }

        #endregion

    }
}
