// Streaming parser for Apple Health export.xml.
// Apple writes one <Record .../> per line, so we tokenize the file
// line-by-line without loading the whole XML into memory.

import { db, type BodyMetric, type VitalLog } from './db'

const HK = {
  weight: 'HKQuantityTypeIdentifierBodyMass',
  bodyFat: 'HKQuantityTypeIdentifierBodyFatPercentage',
  waist: 'HKQuantityTypeIdentifierWaistCircumference',
  systolic: 'HKQuantityTypeIdentifierBloodPressureSystolic',
  diastolic: 'HKQuantityTypeIdentifierBloodPressureDiastolic',
  restingHr: 'HKQuantityTypeIdentifierRestingHeartRate',
  hrv: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
} as const

const TARGET_TYPES = new Set<string>(Object.values(HK))

const RECORD_RE = /<Record\s[^>]*?\/>/g
const ATTR = {
  type: /\stype="([^"]+)"/,
  unit: /\sunit="([^"]+)"/,
  value: /\svalue="([^"]+)"/,
  startDate: /\sstartDate="([^"]+)"/,
  endDate: /\sendDate="([^"]+)"/,
  sourceName: /\ssourceName="([^"]+)"/,
}

function pick(line: string, regex: RegExp): string | undefined {
  const m = line.match(regex)
  return m ? m[1] : undefined
}

export type ParsedRecord = {
  type: string
  startDate: string
  value: number
  unit?: string
  sourceName?: string
}

export type HealthImportSummary = {
  weight: number
  bodyFat: number
  waist: number
  bloodPressure: number
  restingHr: number
  hrv: number
  totalScanned: number
}

export type HealthImportPreview = HealthImportSummary & {
  rangeFrom?: string
  rangeTo?: string
  records: ParsedRecord[]
  bpPairs: Array<{ at: string; systolic: number; diastolic: number; source?: string }>
}

// Parse a File of Apple Health export.xml into typed records.
// onProgress receives bytes read so far for UI feedback.
export async function parseAppleHealthXml(
  file: File,
  onProgress?: (bytesRead: number, totalBytes: number) => void,
): Promise<HealthImportPreview> {
  const records: ParsedRecord[] = []
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let bytesRead = 0

  const reader = file.stream().getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    bytesRead += value.byteLength
    buffer += decoder.decode(value, { stream: true })
    // Process complete lines; keep trailing partial in buffer.
    const lastNewline = buffer.lastIndexOf('\n')
    if (lastNewline === -1) continue
    const chunk = buffer.slice(0, lastNewline)
    buffer = buffer.slice(lastNewline + 1)
    extractRecords(chunk, records)
    onProgress?.(bytesRead, file.size)
  }
  // Flush remaining buffer.
  buffer += decoder.decode()
  extractRecords(buffer, records)
  onProgress?.(file.size, file.size)

  // Pair systolic + diastolic by exact startDate.
  const bpBySource = new Map<string, { systolic?: number; diastolic?: number; source?: string }>()
  for (const r of records) {
    if (r.type !== HK.systolic && r.type !== HK.diastolic) continue
    const key = r.startDate
    const slot = bpBySource.get(key) ?? { source: r.sourceName }
    if (r.type === HK.systolic) slot.systolic = r.value
    else slot.diastolic = r.value
    bpBySource.set(key, slot)
  }
  const bpPairs = [...bpBySource.entries()]
    .filter(([, v]) => v.systolic !== undefined && v.diastolic !== undefined)
    .map(([at, v]) => ({ at, systolic: v.systolic!, diastolic: v.diastolic!, source: v.source }))

  const summary: HealthImportSummary = {
    weight: records.filter((r) => r.type === HK.weight).length,
    bodyFat: records.filter((r) => r.type === HK.bodyFat).length,
    waist: records.filter((r) => r.type === HK.waist).length,
    bloodPressure: bpPairs.length,
    restingHr: records.filter((r) => r.type === HK.restingHr).length,
    hrv: records.filter((r) => r.type === HK.hrv).length,
    totalScanned: records.length,
  }

  const allDates = records.map((r) => r.startDate).sort()
  return {
    ...summary,
    rangeFrom: allDates[0],
    rangeTo: allDates[allDates.length - 1],
    records,
    bpPairs,
  }
}

function extractRecords(text: string, out: ParsedRecord[]): void {
  const matches = text.match(RECORD_RE)
  if (!matches) return
  for (const line of matches) {
    const type = pick(line, ATTR.type)
    if (!type || !TARGET_TYPES.has(type)) continue
    const valueStr = pick(line, ATTR.value)
    const startDate = pick(line, ATTR.startDate)
    if (!valueStr || !startDate) continue
    const value = Number(valueStr)
    if (!Number.isFinite(value)) continue
    out.push({
      type,
      startDate,
      value,
      unit: pick(line, ATTR.unit),
      sourceName: pick(line, ATTR.sourceName),
    })
  }
}

// Convert Apple's "YYYY-MM-DD HH:mm:ss +HHMM" to ISO 8601.
function toIso(appleDate: string): string {
  // Replace the first space with 'T'; reformat the tz offset.
  const trimmed = appleDate.trim()
  const m = trimmed.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*([+-]\d{2})(\d{2})$/)
  if (m) return `${m[1]}T${m[2]}${m[3]}:${m[4]}`
  // Already ISO-ish.
  return trimmed
}

// Convert mass to kg regardless of source unit.
function massToKg(value: number, unit?: string): number {
  if (!unit) return value
  const u = unit.toLowerCase()
  if (u === 'kg') return value
  if (u === 'lb' || u === 'lbs') return value * 0.453592
  if (u === 'g') return value / 1000
  return value
}

// Convert length to cm.
function lengthToCm(value: number, unit?: string): number {
  if (!unit) return value
  const u = unit.toLowerCase()
  if (u === 'cm') return value
  if (u === 'm') return value * 100
  if (u === 'in' || u === 'inch' || u === 'inches') return value * 2.54
  return value
}

// Persist preview into the database. Dedupes via BodyMetric.externalKey
// (Apple Health UUIDs aren't in the XML, so we synthesize a key from type+startDate).
export async function commitHealthImport(preview: HealthImportPreview): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0
  let skipped = 0

  await db.transaction('rw', [db.bodyMetrics, db.vitals], async () => {
    // Quantity metrics → bodyMetrics
    for (const r of preview.records) {
      if (r.type === HK.systolic || r.type === HK.diastolic) continue
      const externalKey = `${r.type}|${r.startDate}`
      const existing = await db.bodyMetrics.where('externalKey').equals(externalKey).first()
      if (existing) {
        skipped++
        continue
      }
      const measuredAt = toIso(r.startDate)
      const row: BodyMetric = { measuredAt, source: 'apple_health', externalKey }
      if (r.type === HK.weight) row.weightKg = massToKg(r.value, r.unit)
      else if (r.type === HK.bodyFat) row.bodyFatPct = r.value > 1 ? r.value : r.value * 100
      else if (r.type === HK.waist) row.waistCm = lengthToCm(r.value, r.unit)
      else if (r.type === HK.restingHr) row.restingHr = r.value
      else if (r.type === HK.hrv) row.hrvMs = r.value
      await db.bodyMetrics.add(row)
      inserted++
    }

    // Paired BP → vitals. Dedupe by exact measuredAt match.
    for (const pair of preview.bpPairs) {
      const iso = toIso(pair.at)
      const existing = await db.vitals.where('measuredAt').equals(iso).first()
      if (existing) {
        skipped++
        continue
      }
      const row: VitalLog = {
        measuredAt: iso,
        systolic: Math.round(pair.systolic),
        diastolic: Math.round(pair.diastolic),
        notes: pair.source ? `Apple Health · ${pair.source}` : 'Apple Health',
      }
      await db.vitals.add(row)
      inserted++
    }
  })

  return { inserted, skipped }
}
