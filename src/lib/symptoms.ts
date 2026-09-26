import type { Symptom, SymptomExtra } from './db'

// Symptoms come in two flavours: positive (high = good — mood, energy) and
// negative / side-effects (high = bad — acne, joint pain). Shared by the
// injection check-in and the Overview trend chart so they stay in sync.
export type Direction = 'positive' | 'negative'

export type SymptomDef = {
  /** A built-in column name, or an arbitrary key inside `extras`. */
  key: string
  label: string
  direction: Direction
  /** True for user-defined symptoms, which live in the `extras` JSON. */
  custom?: true
}

export const POSITIVE: SymptomDef[] = [
  { key: 'mood',   label: 'Mood',   direction: 'positive' },
  { key: 'energy', label: 'Energy', direction: 'positive' },
  { key: 'sleep',  label: 'Sleep',  direction: 'positive' },
  { key: 'libido', label: 'Libido', direction: 'positive' },
]

export const NEGATIVE: SymptomDef[] = [
  { key: 'waterRetention',    label: 'Water retention',    direction: 'negative' },
  { key: 'acne',              label: 'Acne',               direction: 'negative' },
  { key: 'nippleSensitivity', label: 'Nipple sensitivity', direction: 'negative' },
  { key: 'jointPain',         label: 'Joint pain',         direction: 'negative' },
  { key: 'headache',          label: 'Headache',           direction: 'negative' },
]

export const ALL_SYMPTOMS: SymptomDef[] = [...POSITIVE, ...NEGATIVE]

// Tone for a 0-5 value given the symptom direction. 3 stays the neutral midpoint
// so every rating logged on the old 1-5 scale keeps the tone it has always had.
// ponytail: that leaves the 0-5 scale slightly bottom-heavy (0,1,2 bad / 3 neutral /
// 4,5 good). Re-tone only if the asymmetry actually bothers anyone reading a chart.
export function chipTone(value: number, direction: Direction): 'good' | 'warn' | 'bad' | 'neutral' {
  if (value === 3) return 'neutral'
  if (direction === 'positive') return value >= 4 ? 'good' : 'bad'
  if (value >= 4) return 'bad'
  if (value <= 2) return 'good'
  return 'warn'
}

// ── Reading and writing a rating ───────────────────────────────────────────
// Built-in symptoms are columns; custom ones live in the `extras` JSON. These
// two are the only places that know the difference, so every screen reads and
// writes a rating the same way whatever kind it is.

export function ratingOf(s: Partial<Symptom>, def: SymptomDef): number | undefined {
  if (def.custom) return s.extras?.[def.key]?.v
  const v = (s as Record<string, unknown>)[def.key]
  return typeof v === 'number' ? v : undefined
}

export function withRating(s: Partial<Symptom>, def: SymptomDef, v: number | undefined): Partial<Symptom> {
  if (!def.custom) return { ...s, [def.key]: v }
  const extras: Record<string, SymptomExtra> = { ...(s.extras ?? {}) }
  if (v === undefined) delete extras[def.key]
  else extras[def.key] = { v, label: def.label, dir: def.direction }
  return { ...s, extras }
}

/** The custom symptoms present in a set of check-ins, newest label winning. */
export function customDefs(rows: Array<Partial<Symptom>>): SymptomDef[] {
  const out = new Map<string, SymptomDef>()
  for (const r of rows) {
    for (const [key, e] of Object.entries(r.extras ?? {})) {
      out.set(key, { key, label: e.label, direction: e.dir, custom: true })
    }
  }
  return [...out.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** Turn a typed name into a stable extras key. */
export const customKey = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
