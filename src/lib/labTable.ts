// Spreadsheet lab results (CSV or Excel): one row per marker, columns found
// by their header ("Test Name", "Value", "Units", "Reference Range", ...).
// Pure (siblings imported with .ts) so node can load it. readLabFile stores the sheet as CSV text behind TABLE_SENTINEL, so a stored
// file re-reads the same way a PDF's extracted text does.

import { parseLabNumber } from './labCatalog.ts'
import { parseLabDate } from './dates.ts'
import type { ExtractedMarker } from './pdf'

export const TABLE_SENTINEL = '[[table]]'

export const isSheetFile = (f: { name: string; type: string }) =>
  /\.(csv|tsv|xlsx)$/i.test(f.name) || /csv|spreadsheetml/.test(f.type)

export function isTableText(text: string | undefined): boolean {
  return !!text && text.startsWith(TABLE_SENTINEL)
}

/** RFC 4180-ish: quoted fields, doubled quotes, commas/semicolons/tabs. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0]
  const count = (c: string) => first.split(c).length
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0]
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

const COLS: Record<string, RegExp> = {
  marker: /^(test|test name|marker|biomarker|analyte|name|parameter|exam|item)$/,
  value: /^(value|result|your result|reading|level)$/,
  unit: /^(units?|uom)$/,
  range: /^(ref(erence)?( range| interval)?|range|normal range|reference ranges?.*)$/,
  low: /^(low|min|lower|ref low|range low)$/,
  high: /^(high|max|upper|ref high|range high)$/,
  date: /^(date|collected|collection date|sample date|test date)$/,
  status: /^(status|flag|result status)$/,
}

// Excel stores dates as days since 1899-12-30.
function cellDate(raw: string): string | undefined {
  const n = Number(raw)
  if (/^\d{5}(\.\d+)?$/.test(raw.trim()) && n > 20000 && n < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10)
  }
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : parseLabDate(raw)
}

function rangeOf(raw: string): { low?: number; high?: number } {
  const s = raw.trim()
  const both = s.match(/^(.+?)\s*(?:-|–|—|to)\s*(.+)$/)
  if (both && parseLabNumber(both[1]) !== undefined) return { low: parseLabNumber(both[1]), high: parseLabNumber(both[2]) }
  const lt = s.match(/^[<≤]=?\s*(.+)$/)
  if (lt) return { high: parseLabNumber(lt[1]) }
  const gt = s.match(/^[>≥]=?\s*(.+)$/)
  if (gt) return { low: parseLabNumber(gt[1]) }
  return {}
}

/** Markers and the draw date from a stored table text (or bare CSV). */
export function parseLabTable(text: string): { markers: ExtractedMarker[]; date?: string } {
  const rows = parseCsv(isTableText(text) ? text.slice(TABLE_SENTINEL.length).trimStart() : text)
  // The header is the first row that names a marker column and a value column.
  const h = rows.findIndex((r) => {
    const n = r.map((c) => c.trim().toLowerCase())
    return n.some((c) => COLS.marker.test(c)) && n.some((c) => COLS.value.test(c))
  })
  if (h < 0) return { markers: [] }
  const head = rows[h].map((c) => c.trim().toLowerCase())
  const col = Object.fromEntries(Object.entries(COLS).map(([k, re]) => [k, head.findIndex((c) => re.test(c))]))
  const get = (r: string[], k: string) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '')

  const markers: ExtractedMarker[] = []
  const dates: string[] = []
  for (const r of rows.slice(h + 1)) {
    const marker = get(r, 'marker')
    const rawValue = get(r, 'value')
    const m = rawValue.match(/^([<>≤≥]=?)?\s*(.+)$/)
    const value = m ? parseLabNumber(m[2]) : undefined
    if (!marker || value === undefined) continue
    const range = col.range >= 0 ? rangeOf(get(r, 'range')) : { low: parseLabNumber(get(r, 'low')), high: parseLabNumber(get(r, 'high')) }
    const status = get(r, 'status').toLowerCase()
    const flag = /^(h|hh)$|above|high/.test(status) ? 'H' : /^(l|ll)$|below|low/.test(status) ? 'L' : undefined
    const d = cellDate(get(r, 'date'))
    if (d) dates.push(d)
    markers.push({ marker, value, unit: get(r, 'unit'), ...range, flag, rawValue: m?.[1] ? rawValue : undefined, confidence: 'high' })
  }
  // The most common date in the sheet is the draw date.
  const tally = new Map<string, number>()
  for (const d of dates) tally.set(d, (tally.get(d) ?? 0) + 1)
  const date = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0]
  return { markers, date }
}

// ── .xlsx: a zip of XML parts. Reads the first sheet with the browser's own
// inflate (DecompressionStream) and DOMParser, so no spreadsheet library.

async function unzip(buf: ArrayBuffer): Promise<Map<string, string>> {
  const v = new DataView(buf)
  let eocd = buf.byteLength - 22
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd -= 1
  if (eocd < 0) throw new Error('Not a zip file')
  const count = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  const out = new Map<string, string>()
  const dec = new TextDecoder()
  for (let i = 0; i < count; i += 1) {
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true)
    const extraLen = v.getUint16(p + 30, true)
    const commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name)) continue
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const data = new Uint8Array(buf, start, size)
    if (method === 0) { out.set(name, dec.decode(data)); continue }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    out.set(name, await new Response(stream).text())
  }
  return out
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

export async function xlsxToRows(buf: ArrayBuffer): Promise<string[][]> {
  const parts = await unzip(buf)
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml')
  const strings = parts.has('xl/sharedStrings.xml')
    ? [...xml(parts.get('xl/sharedStrings.xml')!).getElementsByTagName('si')].map((si) => [...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''))
    : []
  const sheet = [...parts.keys()].filter((k) => k.includes('worksheets')).sort((a, b) => parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, '')))[0]
  if (!sheet) return []
  return [...xml(parts.get(sheet)!).getElementsByTagName('row')].map((row) => {
    const cells: string[] = []
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      cells[colIndex(c.getAttribute('r') ?? 'A')] = t === 's' ? strings[Number(v)] ?? '' : t === 'inlineStr' ? c.getElementsByTagName('t')[0]?.textContent ?? '' : v
    }
    return Array.from(cells, (x) => x ?? '')
  })
}

/** A CSV or .xlsx file as stored table text. */
export async function readSheetFile(file: File): Promise<string> {
  const rows = /\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type)
    ? await xlsxToRows(await file.arrayBuffer())
    : parseCsv(await file.text())
  return rows.length ? `${TABLE_SENTINEL}\n${toCsv(rows)}` : ''
}
