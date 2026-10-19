// A lab report read on the phone (nothing is uploaded). A PDF's own text comes from PDFKit, line by line with where
// each line sits; a page with no usable text (a scan) and a photo are read with Vision's text recognizer. Both hand
// back the same pieces, { s, x, y, w, h } in page points with y going up (as pdf.js gives them on the web), so JS puts
// them into reading-order lines the way the web does (src/labs/read.ts).
import ExpoModulesCore
import PDFKit
import UIKit
import Vision

public final class LabReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LabReader")

    // An .xlsx file's first sheet: string[][] (SheetReader.swift)
    AsyncFunction("readSheet") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do { promise.resolve(try SheetReader.rows(Data(contentsOf: Self.url(uri)))) } catch { promise.reject("ERR_LAB_SHEET", error.localizedDescription) }
      }
    }

    // { pages: { items, ocr }[] }
    AsyncFunction("readPdf") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let doc = PDFDocument(url: Self.url(uri)) else { return promise.reject("ERR_LAB_PDF", "The PDF didn't open") }
        if doc.isLocked { return promise.reject("ERR_LAB_LOCKED", "The PDF is password protected") }
        var pages: [[String: Any]] = []
        for n in 0..<doc.pageCount {
          guard let page = doc.page(at: n) else { continue }
          let box = page.bounds(for: .mediaBox)
          var items: [[String: Any]] = []
          for line in page.selection(for: box)?.selectionsByLine() ?? [] {
            guard let s = line.string?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { continue }
            let b = line.bounds(for: page)
            items.append(["s": s, "x": b.minX, "y": b.minY, "w": b.width, "h": b.height])
          }
          let text = items.compactMap { $0["s"] as? String }.joined(separator: " ")
          if Self.usable(text) {
            pages.append(["items": items, "ocr": false])
          } else {
            // A scan: draw the page at twice its size and read it
            let image = page.thumbnail(of: CGSize(width: box.width * 2, height: box.height * 2), for: .mediaBox)
            pages.append(["items": Self.recognize(image.cgImage, width: box.width, height: box.height), "ocr": true])
          }
        }
        promise.resolve(["pages": pages])
      }
    }

    // { items } for a photo of a report, in the photo's own pixels
    AsyncFunction("readImage") { (uri: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let image = UIImage(contentsOfFile: Self.url(uri).path)?.normalized(), let cg = image.cgImage else {
          return promise.reject("ERR_LAB_IMAGE", "The photo didn't open")
        }
        promise.resolve(["items": Self.recognize(cg, width: CGFloat(cg.width), height: CGFloat(cg.height))])
      }
    }
  }

  static func url(_ uri: String) -> URL {
    URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
  }

  /** Real content, not a scan with a few stray glyphs: some letters and a digit or three (as the web's hasUsableText). */
  static func usable(_ text: String) -> Bool {
    text.unicodeScalars.filter { CharacterSet.letters.contains($0) }.count >= 40
      && text.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }.count >= 3
  }

  /** Vision's lines, scaled to width x height with y going up. */
  static func recognize(_ image: CGImage?, width: CGFloat, height: CGFloat) -> [[String: Any]] {
    guard let image else { return [] }
    var out: [[String: Any]] = []
    let request = VNRecognizeTextRequest { req, _ in
      for o in (req.results as? [VNRecognizedTextObservation]) ?? [] {
        guard let s = o.topCandidates(1).first?.string else { continue }
        let b = o.boundingBox // normalised, origin bottom-left: already y-up
        out.append(["s": s, "x": b.minX * width, "y": b.minY * height, "w": b.width * width, "h": b.height * height])
      }
    }
    request.recognitionLevel = .accurate
    // lab names and units are not dictionary words: "mmol/L" must stay as printed
    request.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: image).perform([request])
    return out
  }
}

extension UIImage {
  /** The photo drawn upright, so Vision's boxes match what was photographed. */
  func normalized() -> UIImage {
    if imageOrientation == .up { return self }
    return UIGraphicsImageRenderer(size: size).image { _ in draw(in: CGRect(origin: .zero, size: size)) }
  }
}
