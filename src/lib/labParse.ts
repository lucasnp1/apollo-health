// Line-based lab report parser. Works on lines reconstructed from a PDF's
// text layer (pdf.ts) or from OCR. Each line is read as one or more rows of
//   <marker name> [(abbr)] <value> [flag] [unit] [flag] [range]
// which is how every mainstream lab prints results (Medichecks, NHS, Quest,
// LabCorp, Brazilian labs). Prose never parses because the value has to sit
// right after the name.

import { MARKER_VARIANTS, isKnownUnit, isPlausible, normalizeUnit, parseLabNumber } from './labCatalog'

export type Confidence = 'high' | 'medium' | 'low'

export type ParsedRow = {
  canonical: string
  value: number
  rawValue: string
  unit: string
  low?: number
  high?: number
  flag?: 'H' | 'L'
  confidence: Confidence
  line: number
}

type AliasRe = { canonical: string; alias: string; re: RegExp }
let ALIASES: AliasRe[] | null = null

function aliasIndex(): AliasRe[] {
  if (ALIASES) return ALIASES
  const out: AliasRe[] = []
  for (const [canonical, ...rest] of MARKER_VARIANTS) {
    for (const alias of [canonical, ...rest]) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Unicode-aware word boundaries so "Hematócrito" and "(Hb)" work.
      out.push({ canonical, alias, re: new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu') })
    }
  }
  // Longest alias first: on an equal start position the longer name wins.
  out.sort((a, b) => b.alias.length - a.alias.length)
  ALIASES = out
  return out
}

// A number as labs print it, including OCR-style ".512" (leading zero lost).
const NUM = String.raw`-?(?:\d[\d.,]*|[.,]\d+)`
const VALUE_RE = new RegExp(String.raw`^([<>≤≥]=?)?\s*(${NUM})(?![\d.,])`)
// A range that sits where a value would be ("8.64 - 29  32.1 nmol/L"),
// used to recognise range-first column layouts.
const RANGE_FIRST_RE = new RegExp(String.raw`^(${NUM})\s*(?:-|–|—|to)\s*(${NUM})\s+([<>≤≥]=?)?\s*(${NUM})(?![\d.,])`)
const FLAG_RE = /^\s*(HH|LL|H|L|\*+|!|High|Low|Abnormal|Elevated|Above|Below|Alto|Baixo)(?=[\s(]|$)/
const UNIT_RE = /^\s*((?:x?10[\^*eE]\d+\/[a-zA-Zµμ]+\d?)|(?:[a-zA-Zµμ%][a-zA-Z0-9µμ%^*.²³]*(?:\/[a-zA-Z0-9µμ.²³,]+)*)|(?:\/[a-zA-Zµμ]+\d?))/
const RANGE_LABEL_RE = /^\s*[|:]?\s*[([]?\s*(?:Range|Ref(?:erence)?(?:\s*(?:Range|Interval|Values?))?|Normal(?:\s*Range)?|Reference Interval|Expected|RI|Ref\.?|Valores? de Refer[êe]ncia|VR)\s*[:=]?\s*/i

function parseRange(after: string): { low?: number; high?: number; consumed: number } {
  // Skip a range label ("Range:", "Ref"), an opening bracket, or plain whitespace.
  const lead = after.match(RANGE_LABEL_RE) ?? after.match(/^\s*[([]\s*/) ?? after.match(/^\s*/)
  const offset = lead ? lead[0].length : 0
  const s = after.slice(offset)
  let m = s.match(new RegExp(String.raw`^(${NUM})\s*(?:-|–|—|to|a)\s*(${NUM})(?![\d.,])`))
  if (m) {
    const low = parseLabNumber(m[1]); const high = parseLabNumber(m[2])
    if (low !== undefined && high !== undefined && low < high) return { low, high, consumed: offset + m[0].length }
  }
  m = s.match(new RegExp(String.raw`^(?:[<≤]=?|up to|below|less than|até|ate)\s*(${NUM})(?![\d.,])`, 'i'))
  if (m) { const high = parseLabNumber(m[1]); if (high !== undefined) return { high, consumed: offset + m[0].length } }
  m = s.match(new RegExp(String.raw`^(?:[>≥]=?|over|above|more than|acima de)\s*(${NUM})(?![\d.,])`, 'i'))
  if (m) { const low = parseLabNumber(m[1]); if (low !== undefined) return { low, consumed: offset + m[0].length } }
  // Two bare numbers (LabCorp style "Low High" columns).
  m = s.match(new RegExp(String.raw`^(${NUM})\s+(${NUM})(?![\d.,])`))
  if (m) {
    const low = parseLabNumber(m[1]); const high = parseLabNumber(m[2])
    if (low !== undefined && high !== undefined && low < high) return { low, high, consumed: offset + m[0].length }
  }
  return { consumed: 0 }
}

function parseFlag(s: string): { flag?: 'H' | 'L'; consumed: number } {
  const m = s.match(FLAG_RE)
  if (!m) return { consumed: 0 }
  const t = m[1].toLowerCase()
  const flag: 'H' | 'L' | undefined = /^(h|hh|high|elevated|above|alto|\*+|!)$/.test(t) ? 'H' : /^(l|ll|low|below|baixo)$/.test(t) ? 'L' : undefined
  return { flag, consumed: m[0].length }
}

// Parse the text that follows a marker name. Returns undefined when it does
// not look like a result row.
function parseTail(tail: string): { row: Omit<ParsedRow, 'canonical' | 'line' | 'confidence'>; consumed: number; unitKnown: boolean; hasRange: boolean } | undefined {
  let s = tail
  let pos = 0
  const take = (n: number) => { s = s.slice(n); pos += n }

  // "(Hb)", "(Serum)", "(Sensitive)": a short parenthetical right after the name.
  for (;;) {
    const p = s.match(/^\s*\([^()]{1,28}\)/)
    if (!p) break
    take(p[0].length)
  }
  const sep = s.match(/^[\s:=|\-–—]*/)
  if (sep) take(sep[0].length)

  let op = ''
  let rawNum = ''
  let rangeFirst: { low?: number; high?: number } | undefined
  let vm = s.match(VALUE_RE)
  if (vm) {
    // Guard: "8.64 - 29 32.1" means the first number is a range, not the value.
    const rf = s.match(RANGE_FIRST_RE)
    if (rf) {
      const low = parseLabNumber(rf[1]); const high = parseLabNumber(rf[2])
      if (low !== undefined && high !== undefined && low < high) {
        rangeFirst = { low, high }
        op = rf[3] ?? ''
        rawNum = rf[4]
        take(rf[0].length)
        vm = null
      }
    }
    if (vm) {
      op = vm[1] ?? ''
      rawNum = vm[2]
      take(vm[0].length)
    }
  } else {
    return undefined
  }
  const value = parseLabNumber(rawNum)
  if (value === undefined) return undefined

  let flag: 'H' | 'L' | undefined
  const f1 = parseFlag(s)
  if (f1.consumed) { flag = f1.flag; take(f1.consumed) }

  let unit = ''
  let unitKnown = false
  const um = s.match(UNIT_RE)
  if (um) {
    const candidate = um[1].replace(/[.,]$/, '')
    if (isKnownUnit(candidate)) {
      unit = normalizeUnit(candidate); unitKnown = true; take(um[0].length)
    } else if (/\//.test(candidate) && candidate.length <= 14) {
      // Looks like a unit we simply don't list yet ("mg/24h"). Keep it, low trust.
      unit = normalizeUnit(candidate); take(um[0].length)
    }
  }

  const f2 = parseFlag(s)
  if (f2.consumed) { if (!flag) flag = f2.flag; take(f2.consumed) }

  let low = rangeFirst?.low
  let high = rangeFirst?.high
  let hasRange = !!rangeFirst
  if (!hasRange) {
    const r = parseRange(s)
    if (r.consumed) { low = r.low; high = r.high; hasRange = true; take(r.consumed) }
  }

  const rawValue = `${op}${rawNum}`.replace(/\s+/g, '')
  return { row: { value, rawValue, unit, low, high, flag }, consumed: pos, unitKnown, hasRange }
}

export function parseLabLine(line: string, lineNo: number): ParsedRow[] {
  const rows: ParsedRow[] = []
  const aliases = aliasIndex()
  let cursor = 0
  const text = line.replace(/\s+/g, ' ')
  while (cursor < text.length) {
    const sub = text.slice(cursor)
    let best: { idx: number; a: AliasRe; len: number } | undefined
    for (const a of aliases) {
      const m = a.re.exec(sub)
      if (!m) continue
      if (!best || m.index < best.idx) best = { idx: m.index, a, len: m[0].length }
      if (best.idx === 0) break
    }
    if (!best) break
    const nameEnd = cursor + best.idx + best.len
    const parsed = parseTail(text.slice(nameEnd))
    if (!parsed) { cursor = nameEnd; continue }

    const shortName = best.a.alias.length <= 3
    if (shortName && !parsed.unitKnown && !parsed.hasRange) { cursor = nameEnd; continue }

    let confidence: Confidence = parsed.unitKnown && parsed.hasRange ? 'high'
      : parsed.unitKnown || parsed.hasRange || parsed.row.flag ? 'medium' : 'low'
    if (!isPlausible(best.a.canonical, parsed.row.value)) confidence = 'low'

    rows.push({ canonical: best.a.canonical, line: lineNo, confidence, ...parsed.row })
    cursor = nameEnd + parsed.consumed
  }
  return rows
}

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 }

// Parse every line; one row per canonical marker (best confidence wins,
// earliest line breaks ties).
export function parseLabLines(lines: string[]): ParsedRow[] {
  const byMarker = new Map<string, ParsedRow>()
  lines.forEach((line, i) => {
    if (!line || line.length > 400) return
    for (const row of parseLabLine(line, i)) {
      const prev = byMarker.get(row.canonical)
      if (!prev || RANK[row.confidence] > RANK[prev.confidence]) byMarker.set(row.canonical, row)
    }
  })
  return [...byMarker.values()].sort((a, b) => a.line - b.line)
}
