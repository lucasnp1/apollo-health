// Range status and the four headline counts for a set of lab results. Shared
// by the Labs page and the public /read tool so both count the same way.

import type { LabExam } from './db'
import type { EnrichedResult } from './insights'
import { canonicalize } from './markers'

export type RangeStatus = 'good' | 'warn' | 'none'

export function rangeStatus(v: number | undefined, low?: number, high?: number): RangeStatus {
  if (v === undefined) return 'none'
  // Without ANY reference range we can't claim in/out of range.
  if (low === undefined && high === undefined) return 'none'
  if (low !== undefined && v < low) return 'warn'
  if (high !== undefined && v > high) return 'warn'
  return 'good'
}

export type LabStats = { markers: number; inRange: number; outOfRange: number; lastTest?: string }

// One entry per canonical marker (its most recent result), then count.
export function labStats(results: EnrichedResult[], exams: LabExam[]): Omit<LabStats, 'lastTest'> {
  const examDate = new Map(exams.map((e) => [e.id, e.collectedAt]))
  const latest = new Map<string, EnrichedResult>()
  for (const r of results) {
    const key = canonicalize(r.marker)?.key ?? r.marker.toLowerCase().trim()
    const prev = latest.get(key)
    if (!prev || (examDate.get(r.examId) ?? '') > (examDate.get(prev.examId) ?? '')) latest.set(key, r)
  }
  let inRange = 0
  let outOfRange = 0
  for (const r of latest.values()) {
    const s = rangeStatus(r.value, r.low, r.high)
    if (s === 'good') inRange += 1
    else if (s === 'warn') outOfRange += 1
  }
  return { markers: latest.size, inRange, outOfRange }
}
