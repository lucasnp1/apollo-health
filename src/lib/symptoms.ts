import type { Symptom } from './db'

// Symptoms come in two flavours: positive (high = good — mood, energy) and
// negative / side-effects (high = bad — acne, joint pain). Shared by the
// injection check-in and the Overview trend chart so they stay in sync.
export type Direction = 'positive' | 'negative'

export type SymptomDef = {
  key: keyof Symptom
  label: string
  direction: Direction
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
