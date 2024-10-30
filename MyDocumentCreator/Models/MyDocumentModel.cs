using MyDocumentCreator.Services.PdfCreation;
using System.ComponentModel.DataAnnotations.Schema;

namespace MyDocumentCreator.Models
{
    public class MyDocumentModel
    {
        public long Id { get; set; }
        public string? TimeStamp { get; set; }
        public string? Title { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public double Margin { get; set; }
        [NotMapped]
        public IFormFile? DrawingFileObj { get; set; }
        public string? DrawingFileName { get; set; }
        public string? DrawingSvgString { get; set; }
        public double DrawingScaleInSource { get; set; }
        [NotMapped]
        public double SvgScaleCorrectionFactor { get; set; } = 1.0;
        public string? DocumentFileName { get; set; }
        [NotMapped]
        public string? DocumentDataJson { get; set; }
    }
}
