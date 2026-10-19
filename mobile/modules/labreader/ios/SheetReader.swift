// An Excel lab sheet (.xlsx) as rows of cells, on the phone: the zip is read by hand and inflated with Apple's
// Compression framework, the XML with Foundation's XMLParser. Only the shared strings and the first sheet are read,
// the same as the web's xlsxToRows (src/lib/labTable.ts), so both apps see the same rows.
import Compression
import Foundation

enum SheetReader {
  static func rows(_ data: Data) throws -> [[String]] {
    let parts = try unzip(data)
    let strings = parts["xl/sharedStrings.xml"].map { Shared.parse($0) } ?? []
    let num = { (k: String) in Int(k.filter(\.isNumber)) ?? 0 }
    guard let name = parts.keys.filter({ $0.hasPrefix("xl/worksheets/sheet") }).sorted(by: { num($0) < num($1) }).first,
          let sheet = parts[name] else { return [] }
    return Cells.parse(sheet, strings)
  }

  struct Bad: LocalizedError { var errorDescription: String? { "That file isn't an Excel sheet Magno can read. Try saving it as CSV." } }

  /** The entries we need, by name: sharedStrings and the worksheets. */
  static func unzip(_ data: Data) throws -> [String: Data] {
    let b = [UInt8](data)
    func u16(_ o: Int) -> Int { Int(b[o]) | Int(b[o + 1]) << 8 }
    func u32(_ o: Int) -> Int { u16(o) | u16(o + 2) << 16 }
    guard b.count >= 22 else { throw Bad() }
    var eocd = b.count - 22
    while eocd >= 0 && u32(eocd) != 0x06054b50 { eocd -= 1 }
    guard eocd >= 0 else { throw Bad() }
    let count = u16(eocd + 10)
    var p = u32(eocd + 16)
    var out: [String: Data] = [:]
    for _ in 0..<count {
      guard p + 46 <= b.count, u32(p) == 0x02014b50 else { throw Bad() }
      let method = u16(p + 10), size = u32(p + 20), full = u32(p + 24)
      let nameLen = u16(p + 28), extraLen = u16(p + 30), commentLen = u16(p + 32), local = u32(p + 42)
      let name = String(decoding: b[(p + 46)..<(p + 46 + nameLen)], as: UTF8.self)
      p += 46 + nameLen + extraLen + commentLen
      guard name == "xl/sharedStrings.xml" || name.hasPrefix("xl/worksheets/sheet") else { continue }
      let start = local + 30 + u16(local + 26) + u16(local + 28)
      guard start + size <= b.count else { throw Bad() }
      let src = Array(b[start..<(start + size)])
      if method == 0 { out[name] = Data(src); continue }
      guard method == 8 else { throw Bad() }
      var dst = [UInt8](repeating: 0, count: max(full, 1))
      // COMPRESSION_ZLIB is raw DEFLATE, which is what a zip holds
      let n = compression_decode_buffer(&dst, dst.count, src, src.count, nil, COMPRESSION_ZLIB)
      out[name] = Data(dst[0..<n])
    }
    return out
  }

  /** <si> entries, rich-text runs joined, phonetic hints left out. */
  final class Shared: NSObject, XMLParserDelegate {
    var out: [String] = []
    var cur: String?
    var inT = false
    var inPh = false
    static func parse(_ d: Data) -> [String] {
      let s = Shared()
      let x = XMLParser(data: d)
      x.delegate = s
      x.parse()
      return s.out
    }
    func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
      if e == "si" { cur = "" } else if e == "rPh" { inPh = true } else if e == "t" && !inPh { inT = true }
    }
    func parser(_ p: XMLParser, foundCharacters s: String) { if inT { cur? += s } }
    func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
      if e == "t" { inT = false } else if e == "rPh" { inPh = false } else if e == "si" { out.append(cur ?? ""); cur = nil }
    }
  }

  /** Rows of cells, each cell at its column (A, B, ... AA) so gaps stay gaps. */
  final class Cells: NSObject, XMLParserDelegate {
    let strings: [String]
    var rows: [[String]] = []
    var row: [String]?
    var ref = "A", type: String?, text = "", inV = false
    init(_ s: [String]) { strings = s }
    static func parse(_ d: Data, _ strings: [String]) -> [[String]] {
      let c = Cells(strings)
      let x = XMLParser(data: d)
      x.delegate = c
      x.parse()
      return c.rows
    }
    static func col(_ ref: String) -> Int {
      ref.unicodeScalars.filter { $0.properties.isAlphabetic }.reduce(0) { $0 * 26 + Int($1.value) - 64 } - 1
    }
    func parser(_ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?, attributes a: [String: String] = [:]) {
      switch e {
      case "row": row = []
      case "c": ref = a["r"] ?? "A"; type = a["t"]; text = ""
      case "v", "t": inV = true
      default: break
      }
    }
    func parser(_ p: XMLParser, foundCharacters s: String) { if inV { text += s } }
    func parser(_ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?) {
      switch e {
      case "v", "t": inV = false
      case "c":
        let i = max(0, Cells.col(ref))
        let v = type == "s" ? (Int(text).flatMap { $0 < strings.count ? strings[$0] : nil } ?? "") : text
        while (row?.count ?? 0) <= i { row?.append("") }
        row?[i] = v
      case "row": if let r = row { rows.append(r) }; row = nil
      default: break
      }
    }
  }
}
