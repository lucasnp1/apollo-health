// Stands in for the web's PDF and OCR libraries (pdfjs-dist, src/lib/ocr.ts, tesseract.js), which src/lib/pdf.ts loads
// only when it reads a file in a browser. The app reads files natively (modules/labreader) and uses pdf.ts only for its
// marker parser, so these are never called; metro.config.js points those imports here.
const no = () => {
  throw new Error('Browser-only: the iOS app reads lab files with modules/labreader')
}
module.exports = { GlobalWorkerOptions: {}, getDocument: no, OPS: {}, default: '', recognizeImage: no, recognizePdfPage: no }
