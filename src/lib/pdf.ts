// Lab report reading: PDF text layer (pdf.js) with OCR fallback for scanned
// pages and photos, then marker extraction.
//
// Text is reconstructed as LINES from the PDF's positioned glyph runs, so a
// results table keeps its "name value unit range" shape. The line parser
// (labParse.ts) does the precise work; the older flattened-text regex pass
// stays as a fallback for oddly laid-out documents and old stored files.

import { MARKER_VARIANTS, fixOcrDigits, isKnownUnit, isPlausible, normalizeUnit } from './labCatalog'
import { parseLabLines, type Confidence } from './labParse'

export type { Confidence }

export type ExtractedMarker = {
  marker: string
  value: number
  unit: string
  // Reference range from the report, when present.
  low?: number
  high?: number
  // How sure the parser is. Low rows are flagged for a second look.
  confidence?: Confidence
  // Out-of-range flag printed by the lab (H/L), when present.
  flag?: 'H' | 'L'
  // The value as printed, e.g. "<0.3", so operators survive the import.
  rawValue?: string
}

// First line of extractedText when some or all pages were read with OCR.
export const OCR_SENTINEL = '[[ocr]]'

export type ReadProgress = { stage: 'text' | 'ocr'; page: number; pages: number; pct?: number }

type PdfTextItem = { str: string; transform: number[]; width: number; height: number }

// Rebuild reading-order lines from pdf.js text items using their positions.
function itemsToLines(items: PdfTextItem[]): string[] {
  type Row = { y: number; h: number; parts: Array<{ x: number; w: number; str: string }> }
  const rows: Row[] = []
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    const h = Math.abs(it.transform[3]) || it.height || 10
    let row: Row | undefined
    for (const r of rows) {
      if (Math.abs(r.y - y) <= Math.max(2, Math.min(r.h, h) * 0.55)) { row = r; break }
    }
    if (!row) { row = { y, h, parts: [] }; rows.push(row) }
    row.parts.push({ x, w: it.width, str: it.str })
  }
  rows.sort((a, b) => b.y - a.y)
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x)
    let out = ''
    let lastEnd = -Infinity
    for (const p of r.parts) {
      if (out) {
        const gap = p.x - lastEnd
        // Wide gaps are column boundaries: keep them visible as extra spaces.
        out += gap > r.h * 1.5 ? '   ' : gap > -r.h * 0.2 ? ' ' : ''
      }
      out += p.str
      lastEnd = p.x + p.w
    }
    return out.replace(/­/g, '').replace(/[ \t]+/g, ' ').trim()
  }).filter(Boolean)
}

async function loadPdfjs() {
  const [pdfjs, pdfWorkerUrl] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default
  return pdfjs
}

// Does a page's text layer look like real content (not a scan with a few
// stray glyphs)? Needs some letters and at least one digit.
function hasUsableText(lines: string[]): boolean {
  const joined = lines.join(' ')
  const letters = (joined.match(/\p{L}/gu) || []).length
  const digits = (joined.match(/\d/g) || []).length
  return letters >= 40 && digits >= 3
}

// Text layer only (no OCR). Kept for callers that just want a quick read.
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs()
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  for (let n = 1; n <= document.numPages; n += 1) {
    const page = await document.getPage(n)
    const content = await page.getTextContent()
    pages.push(itemsToLines(content.items as PdfTextItem[]).join('\n'))
  }
  return pages.join('\n\n')
}

// Full read: text layer per page, OCR for pages without one, or OCR for an
// image file. Returns the line-joined text (prefixed with OCR_SENTINEL when
// OCR was used) so the rest of the pipeline is source-agnostic.
export async function readLabFile(
  file: File,
  onProgress?: (p: ReadProgress) => void,
): Promise<{ text: string; usedOcr: boolean; pages: number }> {
  if (file.type.startsWith('image/')) {
    const { recognizeImage } = await import('./ocr')
    onProgress?.({ stage: 'ocr', page: 1, pages: 1, pct: 0 })
    const lines = await recognizeImage(file, (pct) => onProgress?.({ stage: 'ocr', page: 1, pages: 1, pct }))
    const cleaned = lines.map(fixOcrDigits)
    return { text: cleaned.length ? `${OCR_SENTINEL}\n${cleaned.join('\n')}` : '', usedOcr: true, pages: 1 }
  }

  const pdfjs = await loadPdfjs()
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = document.numPages
  const out: string[] = []
  let usedOcr = false
  let ocr: typeof import('./ocr') | null = null
  for (let n = 1; n <= pages; n += 1) {
    onProgress?.({ stage: 'text', page: n, pages })
    const page = await document.getPage(n)
    const content = await page.getTextContent()
    const lines = itemsToLines(content.items as PdfTextItem[])
    if (hasUsableText(lines)) {
      out.push(lines.join('\n'))
      continue
    }
    // No text layer: render the page and read it.
    ocr ??= await import('./ocr')
    onProgress?.({ stage: 'ocr', page: n, pages, pct: 0 })
    const ocrLines = await ocr.recognizePdfPage(page, (pct) => onProgress?.({ stage: 'ocr', page: n, pages, pct }))
    usedOcr = true
    out.push(ocrLines.map(fixOcrDigits).join('\n'))
  }
  const body = out.join('\n\n').trim()
  return { text: body ? (usedOcr ? `${OCR_SENTINEL}\n${body}` : body) : '', usedOcr, pages }
}

export function wasOcr(text: string | undefined): boolean {
  return !!text && text.startsWith(OCR_SENTINEL)
}

// ── Marker extraction ─────────────────────────────────────────────────────

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

export function extractMarkersFromText(text: string): ExtractedMarker[] {
  const ocr = wasOcr(text)
  const body = ocr ? text.slice(OCR_SENTINEL.length) : text
  const lines = body.split(/\r?\n/)

  const found = new Map<string, ExtractedMarker>()
  for (const row of parseLabLines(lines)) {
    // OCR digits can be misread, so never call an OCR row "high".
    const confidence: Confidence = ocr && row.confidence === 'high' ? 'medium' : row.confidence
    found.set(row.canonical, {
      marker: row.canonical,
      value: row.value,
      unit: row.unit,
      low: row.low,
      high: row.high,
      flag: row.flag,
      rawValue: row.rawValue,
      confidence,
    })
  }

  // Fallback: flattened-text regex pass for anything the line parser missed
  // (multi-line labels, unusual layouts, files stored before line support).
  for (const f of legacyExtract(body)) {
    if (found.has(f.marker)) continue
    const confidence: Confidence = f.score >= 12 && !ocr ? 'medium' : 'low'
    found.set(f.marker, { marker: f.marker, value: f.value, unit: f.unit, low: f.low, high: f.high, confidence })
  }

  return [...found.values()]
    .sort((a, b) => RANK[b.confidence ?? 'low'] - RANK[a.confidence ?? 'low'])
    .slice(0, 80)
}

// ── Legacy flattened-text extraction (fallback) ───────────────────────────

const VALUE_REGEX = '(?:[<>]\\s*)?(-?\\d+(?:[.,]\\d+)?)'
const UNIT_REGEX = '([0-9a-zA-Zµμ%][a-zA-Z0-9µμ/%^.]*)?'
// Gap between the marker name and its value: whitespace/punctuation and at
// most one single-letter flag. Any lowercase word in between means prose.
const GAP_REGEX = '[^A-Za-z0-9]{0,8}(?:[A-Z][^A-Za-z0-9]{0,4})?'

type LegacyCandidate = { marker: string; value: number; unit: string; low?: number; high?: number; score: number }

function legacyExtract(text: string): LegacyCandidate[] {
  const normalized = text.replace(/­/g, '').replace(/\s+/g, ' ')
  const flat: Array<{ canonical: string; alias: string }> = []
  for (const [canonical, ...aliases] of MARKER_VARIANTS) {
    flat.push({ canonical, alias: canonical })
    for (const a of aliases) flat.push({ canonical, alias: a })
  }
  flat.sort((a, b) => b.alias.length - a.alias.length)

  type Candidate = LegacyCandidate & { start: number; end: number }
  const accepted = new Map<string, Candidate>()
  const consumed: Array<[number, number]> = []
  const overlaps = (s: number, e: number) => consumed.some(([a, b]) => s < b && e > a)

  for (const { canonical, alias } of flat) {
    if (accepted.has(canonical)) continue
    if (/[()]/.test(alias)) continue // parenthetical aliases are for the line parser
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`\\b${escaped}\\b${GAP_REGEX}${VALUE_REGEX}\\s*${UNIT_REGEX}`, 'gi')
    const candidates: Candidate[] = []
    let m: RegExpExecArray | null
    while ((m = pattern.exec(normalized)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (overlaps(start, end)) continue
      const value = Number(m[1].replace(',', '.'))
      if (!Number.isFinite(value)) continue
      let unit = (m[2] || '').replace(/[.,]$/, '')
      if (unit && /^[0-9.]+$/.test(unit)) unit = ''
      const score = scoreCandidate(canonical, value, unit, start, end, normalized)
      if (score <= 0) continue
      const range = parseRangeNear(normalized, end)
      candidates.push({ marker: canonical, value, unit: unit ? normalizeUnit(unit) : '', start, end, score, low: range.low, high: range.high })
    }
    if (candidates.length === 0) continue
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]
    consumed.push([best.start, best.end])
    accepted.set(canonical, best)
  }
  return [...accepted.values()]
}

function parseRangeNear(text: string, from: number): { low?: number; high?: number } {
  const window = text.slice(from, from + 80)
  const m = window.match(/\bRange\s*[:=]\s*([^)\n]*?)(?:\)|$)/i)
  if (!m) return {}
  const body = m[1].trim()
  const range = body.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:[-–—]|to)\s*(-?\d+(?:[.,]\d+)?)/i)
  if (range) return { low: parseFloat(range[1].replace(',', '.')), high: parseFloat(range[2].replace(',', '.')) }
  const lt = body.match(/^[<≤]=?\s*(-?\d+(?:[.,]\d+)?)/)
  if (lt) return { high: parseFloat(lt[1].replace(',', '.')) }
  const gt = body.match(/^[>≥]=?\s*(-?\d+(?:[.,]\d+)?)/)
  if (gt) return { low: parseFloat(gt[1].replace(',', '.')) }
  return {}
}

function scoreCandidate(canonical: string, value: number, unit: string, start: number, end: number, text: string): number {
  let score = 1
  const after = text.slice(end, end + 60)
  if (/\(\s*Range\s*[:=]/i.test(after)) score += 8
  if (/\bRange\s*[:=]/i.test(after)) score += 2
  if (/\bRef\s+(Low|High)\b/i.test(after)) score += 3
  if (unit) {
    if (isKnownUnit(unit)) score += 5
    else if (/^(hours?|minutes?|seconds?|days?|weeks?|years?|months?|times?|each|per)$/i.test(unit)) return -1
    else score -= 2
  } else {
    score -= 1
  }
  const before = text.slice(Math.max(0, start - 40), start)
  if (/\b(your|the|is|are|at|with|of|than|to|in|on|by|over|under|about|within|range|normal)\s+$/i.test(before)) score -= 4
  if (/\b(is|are|at|than|to|reflects?|considered|sits?|sit)\s+/i.test(text.slice(start, end))) score -= 3
  const beforeWide = text.slice(Math.max(0, start - 80), start)
  if (/\b(Liver|Kidney|Cholesterol|Iron|Thyroid|Hormone|Vitamin|Inflammation|Protein|Mineral|Diabetes|Glucose|Hematology|Haematology|Lipid|Cardiovascular)\s+(Health|Status|Panel|Function)?\b/i.test(beforeWide)) score += 2
  if (!isPlausible(canonical, value)) score -= 5
  if (value === 0) score -= 3
  return score
}

// ── Collection date extraction ────────────────────────────────────────────

const DATE_LABELS = [
  /\b(?:collection|specimen|sample)\s*(?:date|collected|taken|received)\b/i,
  /\bdate\s+(?:of\s+)?(?:collect(?:ed|ion)|sample|draw)\b/i,
  /\bcollected\s*(?:on|at)?\b/i,
  /\bspecimen\s+received\b/i,
  /\bsample\s+(?:date|received|taken)\b/i,
  /\b(?:drawn|draw date)\b/i,
  /\b(?:data\s+d[ae]\s+coleta|coleta|colhido\s+em)\b/i,
  /\b(?:reported|report)\s*(?:date)?\b/i,
]

function parseLabDate(raw: string): string | undefined {
  const s = raw.trim()
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // d/m/yyyy is the default (UK, EU, Brazil). Only a first number above 12
  // could disambiguate, and it also means day-first.
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    // m/d/yyyy only when the second number cannot be a month.
    const [day, month] = b > 12 && a <= 12 ? [b, a] : [a, b]
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})/)
  if (m) {
    const mi = months.indexOf(m[2].slice(0, 3).toLowerCase())
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})/)
  if (m) {
    const mi = months.indexOf(m[1].slice(0, 3).toLowerCase())
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
  }
  return undefined
}

export function extractCollectionDate(text: string): string | undefined {
  const found: string[] = []
  for (const label of DATE_LABELS) {
    const re = new RegExp(label.source + '.{0,60}', label.flags + 'g')
    for (const m of text.matchAll(re)) {
      const iso = parseLabDate(m[0])
      if (iso) found.push(iso)
    }
  }
  if (found.length === 0) return undefined
  // Earliest date wins: collection comes before reporting.
  found.sort()
  return found[0]
}
