// Display config for Apollo Pro. The PRICES here are for DISPLAY ONLY — the
// actual charge comes from the Stripe Price you create for each plan. Keep the
// numbers in sync with Stripe and with the landing page pricing cards (this is
// the one file to edit on the app side).

export type PlanKind = 'monthly' | 'lifetime'

export const PRO_PLANS: Array<{
  kind: PlanKind
  label: string
  price: string
  cadence: string
  note?: string
  highlight?: boolean
}> = [
  { kind: 'monthly', label: 'Monthly', price: '£4.99', cadence: 'per month', note: 'First month free', highlight: true },
  { kind: 'lifetime', label: 'Lifetime', price: '£99', cadence: 'one time', note: 'Pay once' },
]

export const PRO_FEATURES = [
  'Import lab results straight from a PDF or photo',
  'Bloods analysis in plain words: causes and what people do',
  'Doctor-ready CSV and PDF export',
  'Injection reminders (coming soon)',
]
