import { format, parseISO } from 'date-fns'
import type { Compound, InjectionLog, LabExam, LabResult, TestosteroneEster, VitalLog } from './db'

export const esterProfiles: Record<TestosteroneEster, { label: string; halfLifeDays: number; peakHours: number; note: string }> = {
  Enanthate: {
    label: 'Testosterone Enanthate',
    halfLifeDays: 4.5,
    peakHours: 24,
    note: 'Estimate only. Absorption varies by route, carrier oil, dose, and person.',
  },
  Cypionate: {
    label: 'Testosterone Cypionate',
    halfLifeDays: 5,
    peakHours: 24,
    note: 'Estimate only. Often modeled similarly to enanthate for trend visualization.',
  },
  Propionate: {
    label: 'Testosterone Propionate',
    halfLifeDays: 2,
    peakHours: 12,
    note: 'Estimate only. Shorter ester, faster decay curve.',
  },
  Undecanoate: {
    label: 'Testosterone Undecanoate',
    halfLifeDays: 20,
    peakHours: 168,
    note: 'Estimate only. Long depot behavior is more complex than this simple model.',
  },
  Custom: {
    label: 'Custom ester',
    halfLifeDays: 5,
    peakHours: 24,
    note: 'Custom model. Use only as a visual planning estimate.',
  },
}

export type EnrichedResult = LabResult & { exam?: LabExam }

export type CorrelationInsight = {
  title: string
  value: string
  strength: 'Weak' | 'Moderate' | 'Strong' | 'Not enough data'
  detail: string
}

const dayMs = 24 * 60 * 60 * 1000

export function inferEster(compound?: Compound): TestosteroneEster {
  const name = compound?.name.toLowerCase() ?? ''
  if (compound?.ester) return compound.ester
  if (name.includes('cyp')) return 'Cypionate'
  if (name.includes('prop')) return 'Propionate'
  if (name.includes('undec')) return 'Undecanoate'
  if (name.includes('testosterone')) return 'Enanthate'
  return 'Custom'
}

export function findCompound(compounds: Compound[], needle: string) {
  return compounds.find((compound) => compound.name.toLowerCase().includes(needle.toLowerCase()))
}

export function buildWeightDoseSeries(compounds: Compound[], injections: InjectionLog[]) {
  const reta = findCompound(compounds, 'reta')
  if (!reta?.id) return []

  return injections
    .filter((entry) => entry.compoundId === reta.id && (entry.weightKg !== undefined || entry.dose !== undefined))
    .sort((a, b) => parseISO(a.takenAt).getTime() - parseISO(b.takenAt).getTime())
    .map((entry) => ({
      date: format(parseISO(entry.takenAt), 'MMM d'),
      timestamp: parseISO(entry.takenAt).getTime(),
      weight: entry.weightKg,
      dose: entry.dose,
      doseLabel: entry.rawDose ?? (entry.dose ? `${entry.dose} ${entry.unit}` : ''),
    }))
}

export function weightSummary(series: ReturnType<typeof buildWeightDoseSeries>) {
  const withWeight = series.filter((point) => point.weight !== undefined)
  if (withWeight.length < 2) return { start: undefined, latest: undefined, delta: undefined, percent: undefined }
  const start = withWeight[0].weight!
  const latest = withWeight[withWeight.length - 1].weight!
  const delta = latest - start
  return { start, latest, delta, percent: (delta / start) * 100 }
}

export function activeTestosteroneAt(
  at: Date,
  compound: Compound | undefined,
  injections: InjectionLog[],
  ester: TestosteroneEster = inferEster(compound),
) {
  if (!compound?.id) return 0
  const profile = esterProfiles[ester]
  return injections
    .filter((entry) => entry.compoundId === compound.id && entry.dose !== undefined)
    .reduce((total, entry) => {
      const elapsedDays = (at.getTime() - parseISO(entry.takenAt).getTime()) / dayMs
      if (elapsedDays < 0) return total
      const decayDays = Math.max(0, elapsedDays - profile.peakHours / 24)
      return total + entry.dose! * Math.pow(0.5, decayDays / profile.halfLifeDays)
    }, 0)
}

export function buildTestosteroneCurve(compounds: Compound[], injections: InjectionLog[], esterOverride?: TestosteroneEster) {
  const testosterone = findCompound(compounds, 'testosterone')
  const ester = esterOverride ?? inferEster(testosterone)
  const relevant = testosterone?.id
    ? injections.filter((entry) => entry.compoundId === testosterone.id && entry.dose !== undefined)
    : []
  if (!testosterone || relevant.length === 0) return { compound: testosterone, ester, points: [], activeNow: 0, lastInjection: undefined as InjectionLog | undefined }

  const sorted = [...relevant].sort((a, b) => parseISO(a.takenAt).getTime() - parseISO(b.takenAt).getTime())
  const lastInjection = sorted[sorted.length - 1]
  const anchor = parseISO(lastInjection.takenAt)
  const start = new Date(anchor.getTime() - 14 * dayMs)
  const points = Array.from({ length: 36 }, (_, index) => {
    const date = new Date(start.getTime() + index * dayMs)
    return {
      date: format(date, 'MMM d'),
      timestamp: date.getTime(),
      active: Number(activeTestosteroneAt(date, testosterone, relevant, ester).toFixed(1)),
      marker: Math.abs(date.getTime() - anchor.getTime()) < dayMs / 2 ? 'last dose' : '',
    }
  })

  return {
    compound: testosterone,
    ester,
    points,
    activeNow: Number(activeTestosteroneAt(new Date(), testosterone, relevant, ester).toFixed(1)),
    lastInjection,
  }
}

export function latestResult(results: EnrichedResult[], aliases: string[]) {
  const lowerAliases = aliases.map((alias) => alias.toLowerCase())
  return [...results]
    .filter((result) => lowerAliases.some((alias) => result.marker.toLowerCase().includes(alias)))
    .filter((result) => result.exam)
    .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())[0]
}

export function markerHistory(results: EnrichedResult[], marker: string) {
  return results
    .filter((result) => result.marker === marker && result.exam && result.value !== undefined)
    .sort((a, b) => parseISO(a.exam!.collectedAt).getTime() - parseISO(b.exam!.collectedAt).getTime())
    .map((result) => ({
      date: format(parseISO(result.exam!.collectedAt), 'MMM d'),
      value: result.value,
      rawValue: result.rawValue,
      unit: result.unit ?? '',
    }))
}

export function labStatus(result?: LabResult) {
  if (!result) return 'No data'
  const raw = result.status?.toLowerCase()
  if (raw?.includes('cancel')) return 'Cancelled'
  if (raw?.includes('high')) return 'High'
  if (raw?.includes('low')) return 'Low'
  if (result.value !== undefined && result.low !== undefined && result.value < result.low) return 'Low'
  if (result.value !== undefined && result.high !== undefined && result.value > result.high) return 'High'
  return 'In range or unflagged'
}

export function flagLatestResults(results: EnrichedResult[]) {
  const latestExam = [...results]
    .filter((result) => result.exam)
    .sort((a, b) => parseISO(b.exam!.collectedAt).getTime() - parseISO(a.exam!.collectedAt).getTime())[0]?.exam
  if (!latestExam?.id) return []

  return results
    .filter((result) => result.examId === latestExam.id)
    .filter((result) => {
      const status = labStatus(result)
      return status === 'High' || status === 'Low' || status === 'Cancelled'
    })
    .slice(0, 8)
}

export function buildCorrelationInsights(
  compounds: Compound[],
  injections: InjectionLog[],
  vitals: VitalLog[],
  results: EnrichedResult[],
): CorrelationInsight[] {
  const weightSeries = buildWeightDoseSeries(compounds, injections).filter((point) => point.weight !== undefined)
  const bpWeightPairs = vitals
    .map((vital) => {
      const nearest = nearestPoint(parseISO(vital.measuredAt).getTime(), weightSeries, 21)
      return nearest ? [nearest.weight!, vital.systolic] as [number, number] : undefined
    })
    .filter((pair): pair is [number, number] => Boolean(pair))

  const hematocrit = results.filter((result) => result.marker.toLowerCase().includes('haematocrit') || result.marker.toLowerCase().includes('hematocrit'))
  const bpHematocritPairs = hematocrit
    .filter((result) => result.exam && result.value !== undefined)
    .map((result) => {
      const nearest = nearestVital(parseISO(result.exam!.collectedAt).getTime(), vitals, 45)
      return nearest ? [result.value!, nearest.systolic] as [number, number] : undefined
    })
    .filter((pair): pair is [number, number] => Boolean(pair))

  const testosterone = findCompound(compounds, 'testosterone')
  const estradiol = results.filter((result) => /estradiol|oestradiol/i.test(result.marker))
  const testEstradiolPairs = estradiol
    .filter((result) => result.exam && result.value !== undefined)
    .map((result) => {
      const active = activeTestosteroneAt(parseISO(result.exam!.collectedAt), testosterone, injections, inferEster(testosterone))
      return active > 0 ? [active, result.value!] as [number, number] : undefined
    })
    .filter((pair): pair is [number, number] => Boolean(pair))

  return [
    describeCorrelation('BP vs weight', bpWeightPairs, 'Pairs each BP reading with the closest logged weight within 21 days.'),
    describeCorrelation('BP vs hematocrit', bpHematocritPairs, 'Pairs blood pressure with the closest hematocrit result within 45 days.'),
    describeCorrelation('Test estimate vs estradiol', testEstradiolPairs, 'Compares estimated testosterone load at exam date with estradiol/oestradiol.'),
  ]
}

function nearestPoint<T extends { timestamp: number }>(timestamp: number, points: T[], maxDays: number) {
  const nearest = points
    .map((point) => ({ point, delta: Math.abs(point.timestamp - timestamp) / dayMs }))
    .filter((item) => item.delta <= maxDays)
    .sort((a, b) => a.delta - b.delta)[0]
  return nearest?.point
}

function nearestVital(timestamp: number, vitals: VitalLog[], maxDays: number) {
  return nearestPoint(timestamp, vitals.map((vital) => ({ ...vital, timestamp: parseISO(vital.measuredAt).getTime() })), maxDays)
}

function describeCorrelation(title: string, pairs: Array<[number, number]>, detail: string): CorrelationInsight {
  if (pairs.length < 3) {
    return { title, value: 'n/a', strength: 'Not enough data', detail: `${detail} Add more overlapping records.` }
  }

  const r = pearson(pairs)
  const abs = Math.abs(r)
  const strength = pairs.length < 5 || abs < 0.35 ? 'Weak' : abs < 0.65 ? 'Moderate' : 'Strong'
  const direction = r >= 0 ? 'positive' : 'negative'
  return {
    title,
    value: `${r.toFixed(2)} r`,
    strength,
    detail: `${direction} pattern across ${pairs.length} matched records. ${detail}`,
  }
}

function pearson(pairs: Array<[number, number]>) {
  const n = pairs.length
  const avgX = pairs.reduce((sum, pair) => sum + pair[0], 0) / n
  const avgY = pairs.reduce((sum, pair) => sum + pair[1], 0) / n
  const numerator = pairs.reduce((sum, pair) => sum + (pair[0] - avgX) * (pair[1] - avgY), 0)
  const denomX = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[0] - avgX) ** 2, 0))
  const denomY = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair[1] - avgY) ** 2, 0))
  if (denomX === 0 || denomY === 0) return 0
  return numerator / (denomX * denomY)
}
