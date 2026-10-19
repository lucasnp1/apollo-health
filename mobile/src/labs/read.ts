// A lab report into markers: the native reader (modules/labreader) gets the text on the phone, then the web's own
// parser (src/lib/pdf.ts extractMarkersFromText, dates, provider) reads it, so both apps find the same rows.
import { File } from 'expo-file-system'
import { extractCollectionDate } from '@shared/lib/dates'
import { parseCsv, parseLabTable, TABLE_SENTINEL, toCsv } from '@shared/lib/labTable'
import { detectProvider } from '@shared/lib/labTests'
import { type ExtractedMarker, extractMarkersFromText } from '@shared/lib/pdf'
import { type Item, LabReader } from '../../modules/labreader'

// The first line of the text when any of it was read by OCR: the web's pdf.ts OCR_SENTINEL, which makes its parser
// trust OCR digits less
const OCR = '[[ocr]]'

export type ReadResult = { markers: ExtractedMarker[]; date?: string; provider?: string; ocr: boolean; text: string }

/**
 * Reading-order lines from positioned pieces of text: the web's itemsToLines (src/lib/pdf.ts) over the native
 * reader's items. Pieces on one row join left to right; a wide gap is a column boundary and stays visible.
 */
export function itemsToLines(items: Item[]): string[] {
  type Row = { y: number; h: number; parts: Item[] }
  const rows: Row[] = []
  for (const it of items) {
    if (!it.s.trim()) continue
    const h = it.h || 10
    let row = rows.find((r) => Math.abs(r.y - it.y) <= Math.max(2, Math.min(r.h, h) * 0.55))
    if (!row) rows.push((row = { y: it.y, h, parts: [] }))
    row.parts.push(it)
  }
  rows.sort((a, b) => b.y - a.y)
  return rows
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x)
      let out = ''
      let end = -Infinity
      for (const p of r.parts) {
        if (out) {
          const gap = p.x - end
          out += gap > r.h * 1.5 ? '   ' : gap > -r.h * 0.2 ? ' ' : ''
        }
        out += p.s
        end = p.x + p.w
      }
      return out.replace(/­/g, '').replace(/[ \t]+/g, ' ').trim()
    })
    .filter(Boolean)
}

export async function readReport(uri: string, kind: 'pdf' | 'photo', fileName?: string): Promise<ReadResult> {
  if (!LabReader) throw new Error('The report reader is not in this build')
  let body: string
  let ocr: boolean
  if (kind === 'pdf') {
    const { pages } = await LabReader.readPdf(uri)
    ocr = pages.some((p) => p.ocr)
    body = pages.map((p) => itemsToLines(p.items).join('\n')).join('\n\n').trim()
  } else {
    ocr = true
    body = itemsToLines((await LabReader.readImage(uri)).items).join('\n')
  }
  const text = body && ocr ? `${OCR}\n${body}` : body
  return {
    markers: text ? extractMarkersFromText(text) : [],
    date: text ? extractCollectionDate(text)?.date : undefined,
    provider: detectProvider(body, fileName),
    ocr,
    text,
  }
}

/** A spreadsheet of results (CSV, TSV or Excel): one row per marker, columns found by their header, by the web's own
 * parser (src/lib/labTable.ts). Excel is unzipped on the phone (modules/labreader SheetReader.swift). */
export async function readSheet(uri: string, fileName: string): Promise<ReadResult> {
  if (!LabReader) throw new Error('The report reader is not in this build')
  const rows = /\.xlsx$/i.test(fileName) ? await LabReader.readSheet(uri) : parseCsv(await new File(uri).text())
  const text = rows.length ? `${TABLE_SENTINEL}\n${toCsv(rows)}` : ''
  const { markers, date } = text ? parseLabTable(text) : { markers: [], date: undefined }
  return { markers, date, provider: detectProvider(rows.flat().join(' '), fileName), ocr: false, text }
}
